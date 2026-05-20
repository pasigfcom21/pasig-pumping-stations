# Pasig City Pumping Station Monitor

## Project Structure
```
pasig-pumping-stations/
├── public/
│   ├── index.html     ← Main website page
│   ├── style.css      ← All visual styling
│   ├── app.js         ← Map logic, database connection, login
│   └── config.js      ← Supabase keys and admin accounts
├── vercel.json        ← Hosting configuration
└── seed_data.sql      ← Run this in Supabase SQL Editor
```

## Deployment Steps

### 1. Upload to GitHub
- Go to github.com → New Repository
- Name it: pasig-pumping-stations
- Upload all files from this folder

### 2. Run SQL in Supabase
- Go to supabase.com → your project → SQL Editor
- Paste the contents of seed_data.sql
- Click Run

### 3. Deploy to Vercel
- Go to vercel.com → Add New Project
- Import from GitHub → select pasig-pumping-stations
- Click Deploy

## Admin Login
Email: pasigfloodmaintenance@gmail.com
Password: PasigFlood2025!

## To Add More Stations
Insert rows into the `stations` and `operators` tables in Supabase.
