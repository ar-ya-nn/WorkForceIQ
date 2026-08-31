from faker import Faker
import random

fake = Faker()
Faker.seed(42)

def generate_sql():
    sql = []
    sql.append("-- SEED DATA FOR WORKFORCEIQ\n")

    # 1. Insert Roles
    sql.append("INSERT INTO roles (role_id, role_name) VALUES (1, 'ADMIN'), (2, 'MANAGER'), (3, 'EMPLOYEE') ON CONFLICT DO NOTHING;")

    # 2. Insert Departments
    depts = ['Engineering', 'Human Resources', 'Sales', 'Marketing', 'Finance']
    for d in depts:
        sql.append(f"INSERT INTO departments (department_name, budget) VALUES ('{d}', {random.randint(50000, 200000)});")

    # 3. Insert Users (Admin, Managers, Employees)
    # Default hashed password string representing a BCrypt hash
    dummy_hash = "$2b$12$e868d.xQ8g5N9iGzU1vC3uL2xK4y6z8a0b1c2d3e4f5g6h7i8j9k"
    
    # 1 Admin
    sql.append(f"INSERT INTO users (first_name, last_name, email, password_hash, role_id, salary) VALUES ('System', 'Admin', 'admin@workforceiq.com', '{dummy_hash}', 1, 120000);")
    
    # 5 Managers
    for i in range(1, 6):
        sql.append(f"INSERT INTO users (first_name, last_name, email, password_hash, role_id, department_id, salary) VALUES ('{fake.first_name()}', '{fake.last_name()}', 'manager{i}@workforceiq.com', '{dummy_hash}', 2, {i}, 90000);")

    # 20 Employees (Linked to managers 2..6)
    for i in range(1, 21):
        fn = fake.first_name().replace("'", "''")
        ln = fake.last_name().replace("'", "''")
        dept_id = random.randint(1, 5)
        mgr_id = dept_id + 1  # maps to the manager of that dept
        sql.append(
            f"INSERT INTO users (first_name, last_name, email, password_hash, role_id, department_id, manager_id, salary) "
            f"VALUES ('{fn}', '{ln}', '{fn.lower()}.{ln.lower()}@workforceiq.com', '{dummy_hash}', 3, {dept_id}, {mgr_id}, {random.randint(45000, 80000)});"
        )

    # 4. Leave Types
    sql.append("INSERT INTO leave_types (type_name, max_days) VALUES ('CL', 12), ('SL', 10), ('EL', 15);")

    with open("seed_data.sql", "w") as f:
        f.write("\n".join(sql))

    print("Faculty-compliant seed_data.sql generated successfully!")

if __name__ == "__main__":
    generate_sql()