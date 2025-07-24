import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';
import { Contact } from '../models/contact';

const router = Router();

// Protect all CRM routes
router.use(authMiddleware);

// Return all CRM contacts
router.get('/', async (_, res) => {
  const list = await Contact.find().exec();
  res.json(list);
});

// Find contacts belonging to a given company. Placed before the generic id
// handler so the path does not get mistaken for a contact identifier.
router.get('/company/:company', async (req, res) => {
  const list = await Contact.find({ company: req.params.company }).exec();
  res.json(list);
});

// Retrieve a single contact by identifier
router.get('/:id', async (req, res) => {
  const contact = await Contact.findById(req.params.id).exec();
  if (!contact) {
    return res.status(404).json({ message: 'Contact not found' });
  }
  res.json(contact);
});

// Add a new contact or update an existing one
router.post('/', requireRole(['admin', 'teamAdmin']), async (req, res) => {
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

// Permanently remove a contact
router.delete('/:id', requireRole(['admin', 'teamAdmin']), async (req, res) => {
  const del = await Contact.findByIdAndDelete(req.params.id).exec();
  if (!del) {
    return res.status(404).json({ message: 'Contact not found' });
  }
  res.json({ message: 'Contact deleted' });
});

export default router;
