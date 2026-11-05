import { FormEvent, useState } from 'react';
import { post, setSession } from '../api';

export function Login() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    try {
      setSession(await post('/auth/login', { login, password }));
      location.href = '/';
    } catch (err: any) {
      setErreur(err.message);
    }
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1>
        <b>Med</b>Force VRP
      </h1>
      <p className="muted">Back-office de la force de vente pharmacies</p>
      <label htmlFor="login">Identifiant</label>
      <input id="login" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus />
      <label htmlFor="pwd">Mot de passe</label>
      <input id="pwd" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {erreur && <div className="alert">{erreur}</div>}
      <p>
        <button type="submit" style={{ width: '100%' }}>
          Se connecter
        </button>
      </p>
    </form>
  );
}
