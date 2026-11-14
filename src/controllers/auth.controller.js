import authService from '../services/auth.service.js';
import { manejarError } from '../libs/errores.js';

const service = new authService();

const login = async (req, res) => {
    try {
        const usuario = await service.login(req.body);
        // Nueva sesión para evitar fijación de sesión.
        await new Promise((ok, falla) => req.session.regenerate((err) => (err ? falla(err) : ok())));
        req.session.usuarioId = usuario.id;
        res.json({ success: true, data: { usuario } });
    } catch (error) {
        manejarError(res, error);
    }
};

const logout = (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('minisuper.sid');
        res.json({ success: true, data: { ok: true } });
    });
};

const yo = (req, res) => {
    res.json({ usuario: req.usuario });
};

const cambiarContrasena = async (req, res) => {
    try {
        const response = await service.cambiarContrasena(req.usuario.id, req.body);
        res.json(response);
    } catch (error) {
        manejarError(res, error);
    }
};

export default { login, logout, yo, cambiarContrasena };
