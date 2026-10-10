const academicService = require('../services/academicService');

exports.list = async (req, res, next) => { try { res.json(await academicService.list(req.params.entity, req.query, req.user)); } catch (error) { next(error); } };
exports.create = async (req, res, next) => { try { res.status(201).json(await academicService.create(req.params.entity, req.body, req.user)); } catch (error) { next(error); } };
exports.update = async (req, res, next) => { try { res.json(await academicService.update(req.params.entity, req.params.id, req.body, req.user)); } catch (error) { next(error); } };
exports.remove = async (req, res, next) => { try { await academicService.remove(req.params.entity, req.params.id, req.user); res.status(204).send(); } catch (error) { next(error); } };
