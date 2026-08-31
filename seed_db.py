from faker import Faker
import random
from datetime import datetime, timedelta

fake = Faker()
Faker.seed(42)

def generate_sql():
    sql = []
    sql.append("-- HIGH-VOLUME ENTERPRISE SEED DATA FOR WORKFORCEIQ\n")

    # 1. Roles
    sql.append("INSERT INTO roles (role_id, role_name) VALUES (1, 'ADMIN'), (2, 'MANAGER'), (3, 'EMPLOYEE') ON CONFLICT DO NOTHING;\n")

    # 2. Departments
    depts = ['Engineering', 'Human Resources', 'Sales', 'Marketing', 'Finance', 'Operations', 'Product', 'Legal', 'Customer Support', 'IT']
    for d in depts:
        sql.append(f"INSERT INTO departments (department_name, budget) VALUES ('{d}', {random.randint(500000, 2000000)});")
    sql.append("")

    # 3. Insert Admin & Managers
    dummy_hash = "$2b$12$e868d.xQ8g5N9iGzU1vC3uL2xK4y6z8a0b1c2d3e4f5g6h7i8j9k"
    sql.append(f"INSERT INTO users (first_name, last_name, email, password_hash, role_id, salary) VALUES ('System', 'Admin', 'admin@workforceiq.com', '{dummy_hash}', 1, 150000);")

    # 10 Managers (user_ids 2 to 11)
    for i in range(1, 11):
        fn, ln = fake.first_name().replace("'", "''"), fake.last_name().replace("'", "''")
        sql.append(f"INSERT INTO users (first_name, last_name, email, password_hash, role_id, department_id, salary) VALUES ('{fn}', '{ln}', 'manager{i}@workforceiq.com', '{dummy_hash}', 2, {i}, {random.randint(95000, 130000)});")

    # 4. Bulk Insert 10,000 Employees (user_ids 12 to 10011)
    TOTAL_USERS = 10000
    user_ids = list(range(12, 12 + TOTAL_USERS))
    chunk_size = 1000

    print("Generating 10,000 users...")
    for i in range(0, TOTAL_USERS, chunk_size):
        user_rows = []
        for u_id in user_ids[i:i + chunk_size]:
            fn = fake.first_name().replace("'", "''")
            ln = fake.last_name().replace("'", "''")
            dept_id = random.randint(1, len(depts))
            mgr_id = dept_id + 1
            salary = random.randint(45000, 90000)
            email = f"emp{u_id}@workforceiq.com"
            user_rows.append(f"('{fn}', '{ln}', '{email}', '{dummy_hash}', 3, {dept_id}, {mgr_id}, {salary})")
        
        sql.append("INSERT INTO users (first_name, last_name, email, password_hash, role_id, department_id, manager_id, salary) VALUES\n" + ",\n".join(user_rows) + ";\n")

    # 5. Leave Types
    sql.append("INSERT INTO leave_types (type_name, max_days) VALUES ('CL', 12), ('SL', 10), ('EL', 15);\n")

    # 6. Bulk Insert Attendance (~15 days for 10,000 users = ~150,000 rows)
    print("Generating ~150,000 attendance records...")
    today = datetime.now().date()
    statuses = ['PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'LATE', 'ABSENT']
    
    att_rows = []
    att_count = 0
    
    for day_offset in range(15):
        att_date = today - timedelta(days=day_offset)
        if att_date.weekday() >= 5:  # Skip weekends
            continue
            
        for u_id in user_ids:
            st = random.choice(statuses)
            if st == 'PRESENT':
                c_in, c_out = f"'{att_date} 09:00:00'", f"'{att_date} 17:00:00'"
            elif st == 'LATE':
                c_in, c_out = f"'{att_date} 10:15:00'", f"'{att_date} 17:30:00'"
            else:
                c_in, c_out = "NULL", "NULL"
            
            att_rows.append(f"({u_id}, '{att_date}', {c_in}, {c_out}, '{st}')")
            att_count += 1
            
            # Flush batch every 2,000 rows to keep SQL statements manageable
            if len(att_rows) >= 2000:
                sql.append("INSERT INTO attendance (user_id, date, check_in, check_out, status) VALUES\n" + ",\n".join(att_rows) + ";\n")
                att_rows = []

    if att_rows:
        sql.append("INSERT INTO attendance (user_id, date, check_in, check_out, status) VALUES\n" + ",\n".join(att_rows) + ";\n")

    # Save to file
    with open("seed_data.sql", "w") as f:
        f.write("\n".join(sql))

    print(f"Success! Generated 10,000 users and {att_count:,} attendance records in 'seed_data.sql'.")

if __name__ == "__main__":
    generate_sql()