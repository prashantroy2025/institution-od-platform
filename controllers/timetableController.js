const service = require('../services/timetableService');
exports.list = async (req, res, next) => { try { res.json(await service.list(req.query, req.user)); } catch (error) { next(error); } };
exports.create = async (req, res, next) => { try { res.status(201).json(await service.create(req.body, req.user)); } catch (error) { next(error); } };
exports.update = async (req, res, next) => { try { res.json(await service.update(req.params.id, req.body, req.user)); } catch (error) { next(error); } };
exports.remove = async (req, res, next) => { try { await service.remove(req.params.id, req.user); res.status(204).send(); } catch (error) { next(error); } };
exports.classrooms = async (req, res, next) => { try { res.json(await service.getClassrooms(req.query, req.user)); } catch (error) { next(error); } };
exports.createClassroom = async (req, res, next) => { try { res.status(201).json(await service.createClassroom(req.body, req.user)); } catch (error) { next(error); } };
exports.updateClassroom = async (req, res, next) => { try { res.json(await service.updateClassroom(req.params.id, req.body, req.user)); } catch (error) { next(error); } };
exports.removeClassroom = async (req, res, next) => { try { await service.removeClassroom(req.params.id, req.user); res.status(204).send(); } catch (error) { next(error); } };