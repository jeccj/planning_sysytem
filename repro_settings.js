
import axios from 'axios';

const API_URL = 'http://localhost:8001';

async function testSettings() {
    try {
        console.log('1. Attempting Login as sys_admin...');
        // Try common default credentials or create a new admin if possible (but we don't have a create admin endpoint exposed publicly usually)
        // Let's try the python script's student login first to see if DB is even accessible

        let token = '';

        try {
            const loginRes = await axios.post(`${API_URL}/auth/login`, {
                username: 'admin',
                password: 'admin_password_placeholder' // We don't know this yet
            });
            token = loginRes.data.access_token;
            console.log('Login successful!', token.substring(0, 10) + '...');
        } catch (e) {
            console.log('Login failed as admin:', e.response?.data || e.message);
            console.log('Attempting to find a valid user from DB...');
            // In a real scenario we'd just check the DB directly with a script
        }

        if (!token) {
            console.error('Cannot proceed without token.');
            return;
        }

        console.log('2. Fetching System Config...');
        const configRes = await axios.get(`${API_URL}/system-config`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Config Response:', configRes.data);

    } catch (e) {
        console.error('Test Failed:', e.response?.data || e.message);
    }
}

testSettings();
