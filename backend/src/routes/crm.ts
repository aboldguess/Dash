import { Router } from 'express';

const router = Router();

interface Contact {
  id: number;
  name: string;
  email: string;
  phone: string;
}

let contacts: Contact[] = [];
let nextId = 1;

// List all contacts
router.get('/', (_, res) => {
  res.json(contacts);
});

// Add or update a contact
router.post('/', (req, res) => {
  const contact = req.body as Contact;
  if (!contact.id) {
    contact.id = nextId++;
    contacts.push(contact);
  } else {
    contacts = contacts.map(c => (c.id === contact.id ? contact : c));
  }
  res.status(201).json(contact);
});

export default router;
