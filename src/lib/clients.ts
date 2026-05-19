export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  caseIds: string[];
  notes: string;
  createdAt: string;
}

const KEY = 'legal_clients';

export const getClients = (): Client[] =>
  JSON.parse(localStorage.getItem(KEY) || '[]');

export const saveClient = (c: Client) => {
  const all = getClients().filter(x => x.id !== c.id);
  localStorage.setItem(KEY, JSON.stringify([...all, c]));
  window.dispatchEvent(new Event('clients_update'));
};

export const deleteClient = (id: string) => {
  localStorage.setItem(KEY, JSON.stringify(getClients().filter(c => c.id !== id)));
  window.dispatchEvent(new Event('clients_update'));
};
