import sqlite3
import json
import http.client
import urllib.parse
import sys
import hashlib
# Node bcrypt hash is complex to generate in pure python without library, 
# so we will trust the previous reset or just try to login.
# Actually, we can't easily generate valid bcrypt in pure python stdlib.
# We will rely on the API content check.

PORT = 8001
HOST = "localhost"

def test_api():
    print(f"--- 1. Checking Backend Connectivity ({HOST}:{PORT}) ---")
    try:
        conn = http.client.HTTPConnection(HOST, PORT, timeout=5)
        conn.request("GET", "/")
        res = conn.getresponse()
        print(f"Root Endpoint: {res.status} {res.reason}")
        if res.status != 200:
            print("❌ Backend root not reachable or error.")
            return False
        print("✅ Backend is reachable.")
        conn.close()
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False

    print("\n--- 2. Testing Admin Login ---")
    token = None
    try:
        conn = http.client.HTTPConnection(HOST, PORT, timeout=5)
        headers = {'Content-type': 'application/json'}
        # Try the reset password
        login_data = json.dumps({"username": "admin", "password": "admin123"})
        conn.request("POST", "/auth/login", login_data, headers)
        res = conn.getresponse()
        data = res.read().decode()
        
        if res.status == 201 or res.status == 200:
            resp_json = json.loads(data)
            if 'access_token' in resp_json:
                token = resp_json['access_token']
                print(f"✅ Login Successful! Token acquired.")
            else:
                print(f"❌ Login response missing token: {data}")
        else:
            print(f"❌ Login Failed: {res.status} {res.reason}")
            print(f"Response: {data}")
            return False
        conn.close()
    except Exception as e:
        print(f"❌ Login request failed: {e}")
        return False

    if token:
        print("\n--- 3. Testing System Config API (Authenticated) ---")
        try:
            conn = http.client.HTTPConnection(HOST, PORT, timeout=5)
            headers = {
                'Content-type': 'application/json',
                'Authorization': f'Bearer {token}'
            }
            conn.request("GET", "/system-config", None, headers)
            res = conn.getresponse()
            data = res.read().decode()
            
            if res.status == 200:
                print(f"✅ System Config API Accessible!")
                print(f"Response snippet: {data[:100]}...")
                return True
            else:
                print(f"❌ System Config Failed: {res.status} {res.reason}")
                print(f"Response: {data}")
                return False
        except Exception as e:
            print(f"❌ System Config request failed: {e}")
            return False

def verify_db_user():
    print("\n--- 4. Direct Database Check ---")
    try:
        # Try standard paths where it might be
        paths = ["campus.db", "../campus.db", "backend-ts/campus.db"]
        db_path = None
        for p in paths:
            try:
                conn = sqlite3.connect(p)
                cursor = conn.cursor()
                cursor.execute("SELECT id, username, role FROM users WHERE username='admin'")
                user = cursor.fetchone()
                conn.close()
                if user:
                    db_path = p
                    print(f"✅ Admin user found in '{p}': {user}")
                    break
            except:
                continue
        
        if not db_path:
            print("❌ Admin user NOT found in standard DB paths.")
    except Exception as e:
        print(f"❌ DB Check failed: {e}")

if __name__ == "__main__":
    if test_api():
        print("\n🎉 SYSTEM VERIFICATION PASSED! You are good to go.")
    else:
        print("\n💥 SYSTEM VERIFICATION FAILED. Please check logs.")
        verify_db_user()
