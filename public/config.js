// Supabase configuration
const SUPABASE_URL = 'https://witgreghmsvbjkuhmnhf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpdGdyZWdobXN2YmprdWhtbmhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNDQwNDQsImV4cCI6MjA5NDcyMDA0NH0.Nw444fJE7fNR7DRlhj8HpIqONNjhbn-SoHcdRZgNAD0';

// Admin accounts (email → role)
// In Phase 3 this will move to proper Supabase Auth
const ADMIN_ACCOUNTS = [
  { email: 'pasigfloodmaintenance@gmail.com', password: 'PasigFlood2025!', role: 'admin', name: 'City Engineer' }
];
