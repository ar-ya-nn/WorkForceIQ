"""
Turns the model's per-employee factor contributions into plain language:
a headline, an honest likelihood, the reasons behind it, and suggested actions
(each with the reason it was suggested).

The attributions come from the model (see backend/ml/train_model.py); this module
only translates them into words. Personal characteristics (gender, age, marital status,
background) are shown when the model used them, but never turned into actions.
"""

SCALE = {1: "very low", 2: "low", 3: "high", 4: "very high"}

# features describing who someone is, not something a manager should act on
PERSONAL = {"gender", "age", "marital_status", "education", "education_field",
            "num_companies_worked", "total_working_years"}


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def describe(feature, value, avg=None):
    """A short clause about this person, e.g. 'works overtime' or 'has low job satisfaction'."""
    v = _num(value)
    avg = _num(avg)
    if feature == "overtime":
        return "works overtime" if value else "doesn't work overtime"
    if feature in ("job_satisfaction", "environment_satisfaction", "relationship_satisfaction",
                   "job_involvement", "work_life_balance") and v is not None:
        label = {"job_satisfaction": "job satisfaction", "environment_satisfaction": "satisfaction with their work environment",
                 "relationship_satisfaction": "satisfaction with work relationships", "job_involvement": "involvement in their work",
                 "work_life_balance": "work-life balance"}[feature]
        return f"has {SCALE.get(int(v), str(int(v)))} {label}"
    if feature == "monthly_income" and v is not None:
        if avg:
            rel = "below" if v < avg else "above"
            return f"earns {rel} the company average ({v:,.0f} vs {avg:,.0f} a month)"
        return f"earns {v:,.0f} a month"
    if feature == "years_since_last_promotion" and v is not None:
        return "was promoted within the last year" if v < 1 else f"hasn't been promoted in {int(v)} year{'s' if v != 1 else ''}"
    if feature == "years_at_company" and v is not None:
        return "joined less than a year ago" if v < 1 else f"has been with the company {int(v)} year{'s' if v != 1 else ''}"
    if feature == "years_in_current_role" and v is not None:
        return f"has been in the same role for {int(v)} year{'s' if v != 1 else ''}"
    if feature == "years_with_curr_manager" and v is not None:
        return f"has worked with their current manager for {int(v)} year{'s' if v != 1 else ''}"
    if feature == "total_working_years" and v is not None:
        return f"has {int(v)} year{'s' if v != 1 else ''} of total work experience"
    if feature == "num_companies_worked" and v is not None:
        return f"has worked at {int(v)} other compan{'ies' if v != 1 else 'y'}"
    if feature == "distance_from_home" and v is not None:
        return f"lives {int(v)} km from work" + (f" (average {avg:.0f} km)" if avg else "")
    if feature == "stock_option_level" and v is not None:
        return "has no stock options" if v == 0 else f"has stock options (level {int(v)})"
    if feature == "percent_salary_hike" and v is not None:
        return f"got a {int(v)}% pay rise last cycle"
    if feature == "training_times_last_year" and v is not None:
        return f"had {int(v)} training session{'s' if v != 1 else ''} last year"
    if feature == "job_level" and v is not None:
        return f"is at job level {int(v)} of 5"
    if feature == "business_travel":
        return {"Travel_Frequently": "travels frequently for work", "Travel_Rarely": "travels occasionally for work",
                "Non-Travel": "doesn't travel for work"}.get(value, "travel pattern not recorded")
    if feature == "job_role":
        return f"works as a {value}" if value else "job role not recorded"
    if feature == "department_name":
        return f"works in {value}" if value else "no department recorded"
    if feature == "age" and v is not None:
        return f"is {int(v)} years old"
    if feature == "gender":
        return f"is {str(value).lower()}" if value else "gender not recorded"
    if feature == "marital_status":
        return f"is {str(value).lower()}" if value else "marital status not recorded"
    if feature == "education" and v is not None:
        return f"has education level {int(v)} of 5"
    if feature == "education_field":
        return f"studied {value}" if value else "field of study not recorded"
    return f"{feature.replace('_', ' ')}: {value}"


def action_for(feature, value):
    """Suggested retention action for a factor that pushes risk UP, or None if not actionable."""
    if feature in PERSONAL:
        return None
    v = _num(value)
    actions = {
        "overtime": "Review their workload and overtime; redistribute tasks or add support.",
        "job_satisfaction": "Have a one-to-one about what would make the role more satisfying.",
        "environment_satisfaction": "Check the team environment, tools and workspace with them.",
        "relationship_satisfaction": "Look into team relationships; consider a mentor or team check-in.",
        "job_involvement": "Involve them in work or projects closer to their interests.",
        "work_life_balance": "Discuss flexible hours, time off or reduced after-hours work.",
        "monthly_income": "Benchmark their pay against similar roles and consider a pay review.",
        "years_since_last_promotion": "Talk about a growth path and what promotion would take.",
        "stock_option_level": "Consider long-term incentives such as stock options.",
        "business_travel": "Reduce or share out travel where possible.",
        "distance_from_home": "Offer hybrid / remote days or commute support.",
        "training_times_last_year": "Offer training or development opportunities.",
        "percent_salary_hike": "Review whether their last raise matched their contribution.",
        "years_at_company": "Strengthen onboarding: assign a buddy and set early goals.",
        "years_in_current_role": "Discuss new challenges or an internal move.",
        "years_with_curr_manager": "Make sure they have regular check-ins with their manager.",
        "job_level": "Clarify the path to the next job level.",
        "job_role": "Look into pressures specific to this role (targets, workload, career path).",
        "department_name": "Check for department-wide issues such as workload or management.",
    }
    if feature == "overtime" and not value:
        return None
    if feature == "stock_option_level" and v not in (0, None):
        return None
    return actions.get(feature)


def likelihood(score, calibration):
    """Turns a model score into an honest, everyday statement using the calibration table."""
    if score is None or not calibration:
        return None, None
    s = float(score)
    bin_ = next((b for b in calibration if b["lo"] <= s <= b["hi"]), None)
    if bin_ is None:
        bin_ = calibration[0] if s < calibration[0]["lo"] else calibration[-1]
    rate, n = bin_["rate"], bin_["n"]
    tenths = round(rate * 10)
    if tenths == 0:
        text = "Fewer than 1 in 10 employees with a similar profile left."
    elif tenths >= 10:
        text = "Almost every employee with a similar profile left."
    else:
        text = f"About {tenths} in 10 employees with a similar profile left."
    caution = f"This is based on only {n} similar people, so treat it as a rough guide." if n < 40 else None
    return text, caution


HEADLINES = {
    "HIGH": "Likely to leave",
    "MEDIUM": "Some risk of leaving",
    "LOW": "Unlikely to leave",
}


def build_explanation(first_name, level, score, factors, profile, averages, calibration, method):
    up, down = (factors or {}).get("up", []), (factors or {}).get("down", [])

    def value_of(feature):
        return profile.get(feature)

    reasons_up = [{"text": describe(f["f"], value_of(f["f"]), averages.get(f["f"])).capitalize(),
                   "personal": f["f"] in PERSONAL} for f in up]
    reasons_down = [{"text": describe(f["f"], value_of(f["f"]), averages.get(f["f"])).capitalize(),
                     "personal": f["f"] in PERSONAL} for f in down]

    actions = []
    for f in up:
        act = action_for(f["f"], value_of(f["f"]))
        if act:
            actions.append({"action": act,
                            "because": f"Because {first_name} {describe(f['f'], value_of(f['f']), averages.get(f['f']))}, "
                                       "which the model links to people leaving."})

    main = [r["text"][0].lower() + r["text"][1:] for r in reasons_up[:2] if not r["personal"]]
    pronoun = {"Male": "he", "Female": "she"}.get(profile.get("gender")) or first_name
    if level == "LOW":
        summary = f"{first_name} looks settled. The model sees few warning signs."
        if reasons_down:
            summary += f" Helping most: {pronoun} {reasons_down[0]['text'][0].lower() + reasons_down[0]['text'][1:]}."
    elif main:
        joined = main[0] if len(main) == 1 else f"{main[0]} and {main[1]}"
        summary = f"{first_name} is {HEADLINES[level].lower()} mainly because {pronoun} {joined}."
    else:
        summary = f"{first_name} is {HEADLINES[level].lower()}, mostly due to their background profile rather than something at work."

    chance, caution = likelihood(score, calibration)
    return {
        "level": level,
        "headline": HEADLINES.get(level, "Not scored"),
        "summary": summary,
        "likelihood": chance,
        "caution": caution,
        "reasons_up": reasons_up,
        "reasons_down": reasons_down,
        "actions": actions[:3],
        "method": method,
        "disclaimer": ("This explains patterns the model learned from past data. It shows associations, not causes. "
                       "Use it to start a conversation, never to make decisions about someone on its own."),
    }


def short_reason(factors, profile):
    """One short phrase for tables: the strongest work-related reason."""
    for f in (factors or {}).get("up", []):
        if f["f"] not in PERSONAL:
            text = describe(f["f"], profile.get(f["f"]))
            return text[0].upper() + text[1:]
    return None
