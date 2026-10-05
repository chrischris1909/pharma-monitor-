import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from './Login';
import { AuthContext } from '../context/AuthContext';

// Mock del AuthContext
const mockLogin = vi.fn();
const mockContext = {
  login: mockLogin,
  user: null,
  loading: false,
};

const renderWithContext = (ui) => {
  return render(
    <AuthContext.Provider value={mockContext}>
      <BrowserRouter>{ui}</BrowserRouter>
    </AuthContext.Provider>
  );
};

describe('Login Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza correctamente el formulario de login', () => {
    renderWithContext(<Login />);
    
    expect(screen.getByText('Pharma Monitor')).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo institucional o usuario/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ingresar al sistema/i })).toBeInTheDocument();
  });

  it('actualiza el estado cuando el usuario escribe en los inputs', () => {
    renderWithContext(<Login />);
    
    const emailInput = screen.getByLabelText(/Correo institucional o usuario/i);
    const passwordInput = screen.getByLabelText(/Contraseña/i);

    fireEvent.change(emailInput, { target: { value: 'admin' } });
    fireEvent.change(passwordInput, { target: { value: 'Siegfried2026' } });

    expect(emailInput.value).toBe('admin');
    expect(passwordInput.value).toBe('Siegfried2026');
  });

  it('llama a la función login del contexto al enviar el formulario', async () => {
    renderWithContext(<Login />);
    
    const emailInput = screen.getByLabelText(/Correo institucional o usuario/i);
    const passwordInput = screen.getByLabelText(/Contraseña/i);
    const submitButton = screen.getByRole('button', { name: /Ingresar al sistema/i });

    fireEvent.change(emailInput, { target: { value: 'admin' } });
    fireEvent.change(passwordInput, { target: { value: 'Siegfried2026' } });
    fireEvent.click(submitButton);

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith('admin', 'Siegfried2026');
  });
});
