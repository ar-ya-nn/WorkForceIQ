-- Run once in pgAdmin (Query Tool on WorkForceIQ). Safe: changes a view only, no data is touched.
-- Makes the attendance summary use the latest recorded date instead of today's date,
-- so the numbers don't go blank as the loaded data gets older.

-- Attendance over the last 30 days of recorded data for each active employee.
CREATE OR REPLACE VIEW v_attendance_summary AS
SELECT u.user_id,
       u.first_name || ' ' || u.last_name                    AS full_name,
       u.department_id,
       COUNT(a.attendance_id)                                 AS days_recorded,
       COUNT(*) FILTER (WHERE a.status = 'PRESENT')           AS present_days,
       COUNT(*) FILTER (WHERE a.status = 'LATE')              AS late_days,
       COUNT(*) FILTER (WHERE a.status = 'ABSENT')            AS absent_days,
       COUNT(*) FILTER (WHERE a.status = 'ON_LEAVE')          AS leave_days,
       ROUND(100.0 * COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE'))
             / NULLIF(COUNT(a.attendance_id), 0), 2)          AS attendance_rate_pct
FROM users u
LEFT JOIN attendance a
       ON a.user_id = u.user_id
      AND a.date BETWEEN (SELECT MAX(date) FROM attendance WHERE status <> 'ON_LEAVE') - 30          -- last 30 days of recorded data
                     AND (SELECT MAX(date) FROM attendance WHERE status <> 'ON_LEAVE')
WHERE u.status = 'ACTIVE'
GROUP BY u.user_id, u.first_name, u.last_name, u.department_id;
