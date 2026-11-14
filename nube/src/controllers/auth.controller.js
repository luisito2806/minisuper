import authService from '../services/auth.service.js';
import { manejarError } from '../libs/errores.js';

const service = new authService();

const login = async (req, res) => {
    try {
        const usuario = await service.login(req.body);
        await new Promise((ok, falla) => req.session.regenerate((e) => (e ? falla(e) : ok())));
        req.session.usuarioId = usuario.id;
        res.json({ usuario: { nombre: usuario.nombre, usuario: usuario.usuario } });
    } catch (error) {
        manejarError(res, error);
    }
};

const logout = (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
};

const yo = (req, res) => {
    res.json({ usuario: req.usuario });
};

export default { login, logout, yo };
