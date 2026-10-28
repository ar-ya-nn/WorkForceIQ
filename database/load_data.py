"""
Loads the IBM HR Analytics Employee Attrition dataset into the WorkForceIQ database.

- Every row of the CSV becomes a user + an employee_profiles row.
- The IBM data has no names, attendance, leave or reviews, so those are generated
  (with a fixed seed, so every run gives the same data for the same date).

Usage (from the repo root, with the venv active and DATABASE_URL in .env):
    python database/load_data.py database/WA_Fn-UseC_-HR-Employee-Attrition.csv
"""

import csv
import os
import random
import re
import sys
from datetime import date, datetime, time, timedelta

from faker import Faker

SEED = 42
DEFAULT_PASSWORD = "Password@123"      # every seeded account uses this password
ATTENDANCE_WEEKDAYS = 30               # attendance history for active employees
LEAVE_TYPES = [("CL", 12), ("SL", 10), ("EL", 15)]
LEAVE_REASONS = {
    "CL": ["Personal work", "Family function", "Bank / government work"],
    "SL": ["Fever", "Medical appointment", "Not feeling well"],
    "EL": ["Vacation", "Travel", "Family trip"],
}
REVIEW_FEEDBACK = {
    3: ["Meets expectations.", "Consistent and reliable work.", "Good performance, room to grow."],
    4: ["Exceeds expectations.", "Outstanding contribution this year.", "Strong performer, ready for more responsibility."],
}


# ---------------------------------------------------------------------------
# 1. Read the CSV
# ---------------------------------------------------------------------------

def read_ibm_csv(path):
    # utf-8-sig strips the hidden BOM the Kaggle file has before "Age"
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    if not rows or "EmployeeNumber" not in rows[0]:
        raise ValueError("This doesn't look like the IBM HR Attrition CSV.")

    seen = set()
    for r in rows:
        num = r["EmployeeNumber"]
        if num in seen:
            raise ValueError(f"Duplicate EmployeeNumber {num} in the CSV.")
        seen.add(num)
        for key, value in r.items():
            if value is None or value.strip() == "":
                raise ValueError(f"Missing value for {key} (EmployeeNumber {num}).")
    return rows


# ---------------------------------------------------------------------------
# 2. Build all the rows in memory (no database needed for this part)
# ---------------------------------------------------------------------------

def _email_part(text):
    return re.sub(r"[^a-z]", "", text.lower())


def _pick_managers(rows):
    """One manager per department: the most senior 'Manager' who hasn't left."""
    managers = {}
    for dept in sorted({r["Department"] for r in rows}):
        in_dept = [r for r in rows if r["Department"] == dept and r["Attrition"] == "No"]
        candidates = [r for r in in_dept if r["JobRole"] == "Manager"] or in_dept
        candidates.sort(key=lambda r: (int(r["JobLevel"]), int(r["TotalWorkingYears"])), reverse=True)
        managers[dept] = candidates[0]["EmployeeNumber"]
    return managers


def _weekdays(start, end):
    d = start
    while d <= end:
        if d.weekday() < 5:
            yield d
        d += timedelta(days=1)


def build_dataset(rows, password_hash, today=None):
    today = today or date.today()
    rng = random.Random(SEED)
    fake = Faker()
    fake.seed_instance(SEED)

    departments = sorted({r["Department"] for r in rows})
    manager_numbers = _pick_managers(rows)
    manager_set = set(manager_numbers.values())

    # --- users + profiles -------------------------------------------------
    people = []
    for r in rows:
        num = int(r["EmployeeNumber"])
        if r["Gender"] == "Male":
            first = fake.first_name_male()
        else:
            first = fake.first_name_female()
        last = fake.last_name()
        years = int(r["YearsAtCompany"])
        joining = today - timedelta(days=years * 365 + rng.randint(0, 300))
        people.append({
            "ibm_number": num,
            "first_name": first,
            "last_name": last,
            "email": f"{_email_part(first)}.{_email_part(last)}{num}@workforceiq.com",
            "role_id": 2 if r["EmployeeNumber"] in manager_set else 3,
            "department": r["Department"],
            "joining_date": joining,
            "status": "EXITED" if r["Attrition"] == "Yes" else "ACTIVE",
            "salary": int(r["MonthlyIncome"]) * 12,
            "profile": {
                "ibm_employee_number": num,
                "age": int(r["Age"]),
                "gender": r["Gender"],
                "marital_status": r["MaritalStatus"],
                "education": int(r["Education"]),
                "education_field": r["EducationField"],
                "job_role": r["JobRole"],
                "job_level": int(r["JobLevel"]),
                "business_travel": r["BusinessTravel"],
                "distance_from_home": int(r["DistanceFromHome"]),
                "monthly_income": int(r["MonthlyIncome"]),
                "percent_salary_hike": int(r["PercentSalaryHike"]),
                "stock_option_level": int(r["StockOptionLevel"]),
                "overtime": r["OverTime"] == "Yes",
                "job_satisfaction": int(r["JobSatisfaction"]),
                "environment_satisfaction": int(r["EnvironmentSatisfaction"]),
                "relationship_satisfaction": int(r["RelationshipSatisfaction"]),
                "job_involvement": int(r["JobInvolvement"]),
                "work_life_balance": int(r["WorkLifeBalance"]),
                "num_companies_worked": int(r["NumCompaniesWorked"]),
                "total_working_years": int(r["TotalWorkingYears"]),
                "training_times_last_year": int(r["TrainingTimesLastYear"]),
                "years_at_company": years,
                "years_in_current_role": int(r["YearsInCurrentRole"]),
                "years_since_last_promotion": int(r["YearsSinceLastPromotion"]),
                "years_with_curr_manager": int(r["YearsWithCurrManager"]),
                "attrition": r["Attrition"] == "Yes",
            },
            "performance_rating": int(r["PerformanceRating"]),
        })

    # department budget = total yearly salary of its people + 15%, rounded
    budgets = {}
    for dept in departments:
        total = sum(p["salary"] for p in people if p["department"] == dept)
        budgets[dept] = round(total * 1.15, -3)

    # --- leave requests (active employees, current year) ------------------
    year_start, year_end = date(today.year, 1, 1), date(today.year, 12, 31)
    latest_start = min(year_end, today + timedelta(days=60))
    leaves = []                                   # (ibm_number, type, start, end, reason, status)
    for p in people:
        if p["status"] != "ACTIVE":
            continue
        used = {name: 0 for name, _ in LEAVE_TYPES}
        taken_ranges = []
        for _ in range(rng.choice([0, 1, 1, 2, 2, 3])):
            ltype, max_days = rng.choice(LEAVE_TYPES)
            length = rng.randint(1, 3)
            span = (latest_start - year_start).days
            start = year_start + timedelta(days=rng.randint(0, max(span, 0)))
            end = start + timedelta(days=length - 1)
            if end > year_end:
                continue
            if start > today:
                status = "PENDING"
            else:
                status = rng.choices(["APPROVED", "REJECTED", "PENDING"], weights=[80, 15, 5])[0]
            if status != "REJECTED":
                overlaps = any(s <= end and e >= start for s, e in taken_ranges)
                if overlaps or used[ltype] + length > max_days:
                    continue
                used[ltype] += length
                taken_ranges.append((start, end))
            leaves.append((p["ibm_number"], ltype, start, end, rng.choice(LEAVE_REASONS[ltype]), status))

    approved_days = {}
    for num, _, start, end, _, status in leaves:
        if status == "APPROVED":
            for d in _weekdays(start, end):
                approved_days.setdefault(num, set()).add(d)

    # --- attendance (last N weekdays, active employees) -------------------
    days = []
    d = today - timedelta(days=1)
    while len(days) < ATTENDANCE_WEEKDAYS:
        if d.weekday() < 5:
            days.append(d)
        d -= timedelta(days=1)
    days.reverse()

    attendance = []                               # (ibm_number, date, check_in, check_out, status)
    for p in people:
        if p["status"] != "ACTIVE":
            continue
        prof = p["profile"]
        p_absent = 0.03 + (0.02 if prof["work_life_balance"] <= 2 else 0)
        p_late = 0.07 + (0.03 if prof["distance_from_home"] > 15 else 0)
        for day in days:
            if day in approved_days.get(p["ibm_number"], ()):
                attendance.append((p["ibm_number"], day, None, None, "ON_LEAVE"))
                continue
            roll = rng.random()
            if roll < p_absent:
                attendance.append((p["ibm_number"], day, None, None, "ABSENT"))
                continue
            if roll < p_absent + p_late:
                status, in_min = "LATE", rng.randint(9 * 60 + 31, 10 * 60 + 45)
            else:
                status, in_min = "PRESENT", rng.randint(8 * 60 + 40, 9 * 60 + 15)
            if prof["overtime"]:
                out_min = rng.randint(18 * 60 + 45, 21 * 60)
            else:
                out_min = rng.randint(17 * 60, 18 * 60 + 15)
            check_in = datetime.combine(day, time(in_min // 60, in_min % 60))
            check_out = datetime.combine(day, time(out_min // 60, out_min % 60))
            attendance.append((p["ibm_number"], day, check_in, check_out, status))

    # --- performance reviews (last year's annual review) ------------------
    reviews = []                                  # (ibm_number, rating, feedback, review_date)
    for p in people:
        review_date = date(today.year - 1, 12, rng.randint(1, 20))
        if p["joining_date"] >= review_date:
            continue
        rating = p["performance_rating"]
        reviews.append((p["ibm_number"], rating, rng.choice(REVIEW_FEEDBACK.get(rating, ["Reviewed."])), review_date))

    return {
        "departments": departments,
        "budgets": budgets,
        "manager_numbers": manager_numbers,
        "people": people,
        "leaves": leaves,
        "attendance": attendance,
        "reviews": reviews,
        "password_hash": password_hash,
    }


# ---------------------------------------------------------------------------
# 3. Write everything to PostgreSQL in ONE transaction
# ---------------------------------------------------------------------------

def load_into_db(conn, data):
    from psycopg2.extras import execute_values

    with conn.cursor() as cur:
        cur.execute("""
            TRUNCATE audit_logs, performance_reviews, leave_requests, attendance,
                     employee_profiles, users, departments, leave_types, roles
            RESTART IDENTITY CASCADE
        """)

        cur.execute("INSERT INTO roles (role_id, role_name) VALUES (1,'ADMIN'), (2,'MANAGER'), (3,'EMPLOYEE')")
        execute_values(cur, "INSERT INTO leave_types (type_name, max_days) VALUES %s", LEAVE_TYPES)

        dept_ids = {}
        for name in data["departments"]:
            cur.execute("INSERT INTO departments (department_name, budget) VALUES (%s, %s) RETURNING department_id",
                        (name, data["budgets"][name]))
            dept_ids[name] = cur.fetchone()[0]

        cur.execute("""
            INSERT INTO users (first_name, last_name, email, password_hash, role_id, salary)
            VALUES ('System', 'Admin', 'admin@workforceiq.com', %s, 1, 1800000)
            RETURNING user_id
        """, (data["password_hash"],))
        admin_id = cur.fetchone()[0]

        # managers first, so employees can point to them
        by_number = {p["ibm_number"]: p for p in data["people"]}
        user_ids = {}
        dept_manager = {}
        for dept, num in data["manager_numbers"].items():
            p = by_number[int(num)]
            cur.execute("""
                INSERT INTO users (first_name, last_name, email, password_hash, role_id,
                                   department_id, manager_id, joining_date, status, salary)
                VALUES (%s,%s,%s,%s,2,%s,%s,%s,%s,%s) RETURNING user_id
            """, (p["first_name"], p["last_name"], p["email"], data["password_hash"],
                  dept_ids[dept], admin_id, p["joining_date"], p["status"], p["salary"]))
            user_ids[p["ibm_number"]] = dept_manager[dept] = cur.fetchone()[0]

        employees = [p for p in data["people"] if p["ibm_number"] not in user_ids]
        execute_values(cur, """
            INSERT INTO users (first_name, last_name, email, password_hash, role_id,
                               department_id, manager_id, joining_date, status, salary)
            VALUES %s
        """, [(p["first_name"], p["last_name"], p["email"], data["password_hash"], 3,
               dept_ids[p["department"]], dept_manager[p["department"]],
               p["joining_date"], p["status"], p["salary"]) for p in employees], page_size=1000)

        cur.execute("SELECT user_id, email FROM users")
        email_to_id = {email: uid for uid, email in cur.fetchall()}
        for p in employees:
            user_ids[p["ibm_number"]] = email_to_id[p["email"]]

        cols = list(data["people"][0]["profile"].keys())
        execute_values(cur,
            f"INSERT INTO employee_profiles (user_id, {', '.join(cols)}) VALUES %s",
            [(user_ids[p["ibm_number"]], *[p["profile"][c] for c in cols]) for p in data["people"]],
            page_size=1000)

        cur.execute("SELECT type_name, leave_type_id FROM leave_types")
        type_ids = dict(cur.fetchall())
        manager_of = {p["ibm_number"]: (admin_id if p["role_id"] == 2 else dept_manager[p["department"]])
                      for p in data["people"]}
        execute_values(cur, """
            INSERT INTO leave_requests (user_id, leave_type_id, start_date, end_date, reason, status, approved_by)
            VALUES %s
        """, [(user_ids[n], type_ids[t], s, e, reason, st, None if st == "PENDING" else manager_of[n])
              for n, t, s, e, reason, st in data["leaves"]], page_size=1000)

        execute_values(cur, "INSERT INTO attendance (user_id, date, check_in, check_out, status) VALUES %s",
                       [(user_ids[n], d, ci, co, st) for n, d, ci, co, st in data["attendance"]],
                       page_size=5000)

        execute_values(cur, """
            INSERT INTO performance_reviews (user_id, reviewer_id, rating, feedback, review_date)
            VALUES %s
        """, [(user_ids[n], manager_of[n], rating, fb, rd) for n, rating, fb, rd in data["reviews"]],
            page_size=1000)

        # the seed itself isn't "activity", so start the audit trail empty
        cur.execute("TRUNCATE audit_logs RESTART IDENTITY")

    conn.commit()


def main():
    if len(sys.argv) != 2:
        print("Usage: python database/load_data.py <path to IBM HR CSV>")
        sys.exit(1)

    import bcrypt
    import psycopg2
    from dotenv import load_dotenv

    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set in .env")
    url = url.replace("postgresql+psycopg2://", "postgresql://")   # psycopg2 wants the plain form

    rows = read_ibm_csv(sys.argv[1])
    password_hash = bcrypt.hashpw(DEFAULT_PASSWORD.encode(), bcrypt.gensalt()).decode()
    data = build_dataset(rows, password_hash)

    conn = psycopg2.connect(url)
    try:
        load_into_db(conn, data)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    active = sum(p["status"] == "ACTIVE" for p in data["people"])
    print("Done!")
    print(f"  departments : {len(data['departments'])}")
    print(f"  users       : {len(data['people']) + 1}  ({active} active, 1 admin)")
    print(f"  leave       : {len(data['leaves'])}")
    print(f"  attendance  : {len(data['attendance'])}")
    print(f"  reviews     : {len(data['reviews'])}")
    print(f"  login       : admin@workforceiq.com / {DEFAULT_PASSWORD}")


if __name__ == "__main__":
    main()
