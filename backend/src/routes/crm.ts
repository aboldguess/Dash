import { Router } from 'express';
import { Contact } from '../models/contact';

const router = Router();

// Return all CRM contacts
router.get('/', async (_, res) => {
  const list = await Contact.find().exec();
  res.json(list);
});

// Add a new contact or update an existing one
router.post('/', async (req, res) => {
  const { id, ...data } = req.body;

  if (id) {
    // Update path when an id is supplied
    const updated = await Contact.findByIdAndUpdate(id, data, { new: true });
    return res.status(201).json(updated);
  }

  const contact = new Contact(data);
  await contact.save();
  res.status(201).json(contact);
});

export default router;
