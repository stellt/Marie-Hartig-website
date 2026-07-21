#!/usr/bin/env node
/**
 * Utility script to manage portfolio access users.
 * Usage:
 *   node scripts/manage-portfolio-users.js add <email> <password>
 *   node scripts/manage-portfolio-users.js list
 *   node scripts/manage-portfolio-users.js remove <email>
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '../netlify/functions/_data/portfolio-access.json');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function loadUsers() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(data.users) ? data.users : [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ users }, null, 2), 'utf8');
}

function addUser(email, password) {
  const users = loadUsers();
  const lowerEmail = email.toLowerCase();

  if (users.some(u => u.email === lowerEmail)) {
    console.error(`✗ User with email "${email}" already exists.`);
    process.exit(1);
  }

  users.push({
    email: lowerEmail,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  });

  saveUsers(users);
  console.log(`✓ User "${email}" added successfully.`);
}

function listUsers() {
  const users = loadUsers();
  if (users.length === 0) {
    console.log('No users registered yet.');
    return;
  }

  console.log('\nRegistered Users:');
  console.log('─'.repeat(60));
  users.forEach(user => {
    console.log(`Email: ${user.email}`);
    console.log(`Added: ${user.createdAt}`);
    console.log('─'.repeat(60));
  });
}

function removeUser(email) {
  const users = loadUsers();
  const lowerEmail = email.toLowerCase();
  const index = users.findIndex(u => u.email === lowerEmail);

  if (index === -1) {
    console.error(`✗ User with email "${email}" not found.`);
    process.exit(1);
  }

  users.splice(index, 1);
  saveUsers(users);
  console.log(`✓ User "${email}" removed successfully.`);
}

const [, , command, ...args] = process.argv;

switch (command) {
  case 'add':
    if (args.length < 2) {
      console.error('Usage: node manage-portfolio-users.js add <email> <password>');
      process.exit(1);
    }
    addUser(args[0], args[1]);
    break;
  case 'list':
    listUsers();
    break;
  case 'remove':
    if (args.length < 1) {
      console.error('Usage: node manage-portfolio-users.js remove <email>');
      process.exit(1);
    }
    removeUser(args[0]);
    break;
  default:
    console.log(`
Usage: node scripts/manage-portfolio-users.js <command> [options]

Commands:
  add <email> <password>    Add a new user
  list                      List all registered users
  remove <email>            Remove a user

Examples:
  node scripts/manage-portfolio-users.js add user@example.com mypassword
  node scripts/manage-portfolio-users.js list
  node scripts/manage-portfolio-users.js remove user@example.com
    `);
    break;
}
