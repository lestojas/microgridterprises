const Dexie = require('dexie');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');

const db = new Dexie('TestDB', { indexedDB, IDBKeyRange });

db.version(1).stores({
  households: 'id',
  members: 'id'
});

db.version(2).stores({
  pending: 'id'
});

db.version(3).stores({
  workers: null,
  authorized_users: 'id',
  events: 'id'
});

async function test() {
  await db.open();
  console.log("households exists:", !!db.households);
  console.log("members exists:", !!db.members);
  console.log("pending exists:", !!db.pending);
  console.log("events exists:", !!db.events);
  
  // Try to access toArray
  try {
    await db.households.toArray();
    console.log("households.toArray() works");
  } catch (e) {
    console.log("Error on households:", e.message);
  }
}

test().catch(console.error);
