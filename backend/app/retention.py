"""
Closed-loop, cost-aware retention planner.

1. score()      - the attrition model, scored from parameters stored in the database (model_runs.info)
2. apply()      - what an intervention changes in an employee's profile (e.g. overtime -> no)
3. recommend()  - searches combinations of interventions for the cheapest / most effective plan
                  that lowers this person's predicted risk, within a budget
4. evidence     - real outcomes of past plans (did the person stay?) adjust how much each
                  intervention is trusted next time: the feedback loop
"""

import math
from itertools import combinations

HIGH_RISK, MEDIUM_RISK = 0.65, 0.40
LEVEL_WORDS = {"HIGH": "Likely to leave", "MEDIUM": "Some risk", "LOW": "Unlikely to leave"}
CAPS = {"job_satisfaction": 4, "environment_satisfaction": 4, "relationship_satisfaction": 4,
        "work_life_balance": 4, "job_involvement": 4, "stock_option_level": 3, "job_level": 5}
EVIDENCE_PRIOR = 10          # how many real outcomes it takes before evidence counts as much as the model


def level(p):
    return "HIGH" if p >= HIGH_RISK else "MEDIUM" if p >= MEDIUM_RISK else "LOW"


# ---------------------------------------------------------------------------
# 1. scoring from stored parameters (same maths as the scikit-learn pipeline)
# ---------------------------------------------------------------------------

def score(model, profile):
    z = model["intercept"]
    for f in model["numeric"]:
        v = profile.get(f["name"])
        if isinstance(v, bool):
            v = float(v)
        try:
            v = float(v)
        except (TypeError, ValueError):
            v = f["median"]
        if math.isnan(v):
            v = f["median"]
        z += f["coef"] * (v - f["mean"]) / f["scale"]
    for f in model["categorical"]:
        v = profile.get(f["name"])
        z += f["weights"].get("Unknown" if v is None else str(v), 0.0)
    return 1.0 / (1.0 + math.exp(-z))


# ---------------------------------------------------------------------------
# 2. interventions: what each one changes
# ---------------------------------------------------------------------------

def apply(change, profile):
    """
    Returns the new profile, or None if the intervention doesn't apply to this person.
    change examples: {"overtime": false}, {"job_satisfaction": "+1"}, {"monthly_income": "*1.10"},
                     {"business_travel": "Travel_Rarely"}, {"years_since_last_promotion": "=0"}
    """
    new = dict(profile)
    useful = False
    for feature, op in change.items():
        current = new.get(feature)
        if isinstance(op, bool) or op is None or (isinstance(op, str) and op[:1] not in "+*="):
            if current == op:
                continue
            if feature == "business_travel" and current != "Travel_Frequently":
                continue                      # only worth reducing for frequent travellers
            new[feature] = op
            useful = True
        elif op.startswith("+"):
            base = float(current) if current is not None else 0.0
            target = base + float(op[1:])
            if feature in CAPS:
                target = min(target, CAPS[feature])
            if target != base:
                new[feature] = target
                useful = True
        elif op.startswith("*"):
            if current is None:
                continue
            new[feature] = float(current) * float(op[1:])
            useful = True
        elif op.startswith("="):
            target = float(op[1:])
            if current is not None and float(current) != target:
                new[feature] = target
                useful = True
    return new if useful else None


def cost_of(intervention, annual_salary):
    if intervention["cost_kind"] == "PCT_SALARY":
        return round((annual_salary or 0) * float(intervention["cost_value"]) / 100.0)
    return round(float(intervention["cost_value"]))


# ---------------------------------------------------------------------------
# 3 + 4. search for the best plans, adjusted by real-world evidence
# ---------------------------------------------------------------------------

def evidence_factor(stats):
    """
    How much to trust an intervention, from past outcomes of completed plans that used it.
    observed = share of those employees still here; expected = what the model predicted they'd be.
    Shrunk towards 1.0 (model only) until enough outcomes exist.
    """
    n = (stats or {}).get("closed", 0) or 0
    if n == 0:
        return 1.0, "Model estimate (no past outcomes yet)"
    observed = stats["retained"] / n
    expected = max(0.05, 1.0 - (stats.get("avg_risk_after") or 0.5))
    raw = max(0.5, min(1.5, observed / expected))
    weight = n / (n + EVIDENCE_PRIOR)
    factor = 1.0 + weight * (raw - 1.0)
    direction = "better" if raw > 1.02 else "worse" if raw < 0.98 else "about as"
    return factor, f"Adjusted with {n} past outcome{'s' if n != 1 else ''}: worked {direction} than predicted"


def recommend(model, profile, annual_salary, catalog, evidence, budget=None, max_actions=3):
    base = score(model, profile)
    options = []
    for item in catalog:
        new = apply(item["change"], profile)
        if new is None:
            continue
        factor, note = evidence_factor(evidence.get(item["type_id"]))
        options.append({**item, "cost": cost_of(item, annual_salary), "factor": factor, "evidence": note})

    candidates = []
    for k in range(1, min(max_actions, len(options)) + 1):
        for combo in combinations(options, k):
            p = dict(profile)
            for item in combo:
                p = apply(item["change"], p) or p
            raw_after = score(model, p)
            factor = sum(i["factor"] for i in combo) / len(combo)
            after = max(0.0, base - (base - raw_after) * factor)
            candidates.append({
                "actions": [{"type_id": i["type_id"], "code": i["code"], "name": i["name"],
                             "cost": i["cost"], "evidence": i["evidence"]} for i in combo],
                "total_cost": sum(i["cost"] for i in combo),
                "risk_after": after,
                "drop": base - after,
            })

    useful = [c for c in candidates if c["drop"] > 0.005]
    affordable = [c for c in useful if budget is None or c["total_cost"] <= budget]
    target = MEDIUM_RISK if base >= MEDIUM_RISK else base * 0.8
    plans, seen = [], set()

    def add(title, why, c):
        if c is None:
            return
        key = tuple(sorted(a["code"] for a in c["actions"]))
        if key in seen:
            return
        seen.add(key)
        plans.append({"title": title, "why": why, **c,
                      "level_after": level(c["risk_after"]), "words_after": LEVEL_WORDS[level(c["risk_after"])]})

    reach = [c for c in affordable if c["risk_after"] < target]
    add("Cheapest plan that lowers the risk level",
        "The lowest-cost combination that moves this person below the current risk level.",
        min(reach, key=lambda c: (c["total_cost"], -c["drop"])) if reach else None)
    add("Biggest impact within budget",
        "The combination the model expects to reduce risk the most, without going over budget.",
        max(affordable, key=lambda c: (c["drop"], -c["total_cost"])) if affordable else None)
    singles = [c for c in affordable if len(c["actions"]) == 1]
    add("Best single step",
        "If you can only do one thing, this is the action with the largest expected effect.",
        max(singles, key=lambda c: c["drop"]) if singles else None)

    return {
        "risk_before": base,
        "level_before": level(base),
        "words_before": LEVEL_WORDS[level(base)],
        "budget": budget,
        "plans": plans,
        "options": sorted(
            [{"type_id": o["type_id"], "name": o["name"], "cost": o["cost"], "evidence": o["evidence"],
              "drop": base - max(0.0, base - (base - score(model, apply(o["change"], profile))) * o["factor"])}
             for o in options], key=lambda o: -o["drop"]),
    }
