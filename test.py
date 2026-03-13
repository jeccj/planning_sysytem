import sqlite3
import csv
import os

db_path = 'campus.db'
csv_path = 'users_export.csv'

if not os.path.exists(db_path):
    print(f"数据库文件 {db_path} 不存在")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT * FROM users ORDER BY id;")
        rows = cursor.fetchall()
        
        # 获取列名
        column_names = ['id', 'username', 'hashed_password', 'role', 'is_first_login', 
                       'contact_info', 'managed_building', 'managed_floor', 
                       'identity_last6', 'login_session_id', 'last_login_at', 'last_active_at']
        
        # 写入CSV
        with open(csv_path, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.writer(f)
            writer.writerow(column_names)
            writer.writerows(rows)
        
        print(f"成功导出 {len(rows)} 条用户记录到 {csv_path}")
        
    except sqlite3.OperationalError as e:
        print(f"错误: {e}")
    
    conn.close()