const { v4: uuidv4 } = require('uuid');

const USERS_KEY = 'users';

function sampleUsers() {
  const timestamp = new Date().toISOString();
  return [
    { id: uuidv4(), name: 'John Doe', email: 'john@example.com', role: 'admin', createdAt: timestamp },
    { id: uuidv4(), name: 'Jane Smith', email: 'jane@example.com', role: 'user', createdAt: timestamp },
    { id: uuidv4(), name: 'Bob Wilson', email: 'bob@example.com', role: 'user', createdAt: timestamp }
  ];
}

function createRedisStore(redis) {
  async function readUsers() {
    const data = await redis.get(USERS_KEY);
    return data ? JSON.parse(data) : [];
  }

  async function writeUsers(users) {
    await redis.set(USERS_KEY, JSON.stringify(users));
  }

  return {
    async ping() {
      await redis.ping();
    },
    async initializeData() {
      const exists = await redis.exists(USERS_KEY);
      if (!exists) {
        await writeUsers(sampleUsers());
      }
    },
    async listUsers() {
      return readUsers();
    },
    async getUser(id) {
      const users = await readUsers();
      return users.find((user) => user.id === id) || null;
    },
    async createUser(payload) {
      const users = await readUsers();
      if (users.find((user) => user.email === payload.email)) {
        return null;
      }

      const user = {
        id: uuidv4(),
        name: payload.name,
        email: payload.email,
        role: payload.role || 'user',
        createdAt: new Date().toISOString()
      };

      users.push(user);
      await writeUsers(users);
      return user;
    },
    async deleteUser(id) {
      const users = await readUsers();
      const index = users.findIndex((user) => user.id === id);
      if (index === -1) {
        return false;
      }

      users.splice(index, 1);
      await writeUsers(users);
      return true;
    }
  };
}

function createMemoryStore() {
  const users = sampleUsers();

  return {
    async ping() {
      return 'PONG';
    },
    async initializeData() {
      return undefined;
    },
    async listUsers() {
      return users;
    },
    async getUser(id) {
      return users.find((user) => user.id === id) || null;
    },
    async createUser(payload) {
      if (users.find((user) => user.email === payload.email)) {
        return null;
      }

      const user = {
        id: uuidv4(),
        name: payload.name,
        email: payload.email,
        role: payload.role || 'user',
        createdAt: new Date().toISOString()
      };
      users.push(user);
      return user;
    },
    async deleteUser(id) {
      const index = users.findIndex((user) => user.id === id);
      if (index === -1) {
        return false;
      }
      users.splice(index, 1);
      return true;
    }
  };
}

module.exports = { createRedisStore, createMemoryStore };
