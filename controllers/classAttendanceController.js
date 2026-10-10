const service = require('../services/classAttendanceService');
exports.mark = async (req, res, next) => { try { res.status(201).json(await service.mark(req.params.timetableId, req.body, req.user)); } catch (error) { next(error); } };
exports.session = async (req, res, next) => { try { res.json(await service.getSession(req.params.timetableId, req.params.date, req.user)); } catch (error) { next(error); } };
exports.history = async (req, res, next) => { try { res.json(await service.history(req.query, req.user)); } catch (error) { next(error); } };
exports.report = async (req, res, next) => { try { res.json(await service.report(req.query, req.user)); } catch (error) { next(error); } };
exports.threshold = async (req, res, next) => { try { res.json(await service.threshold(req.user, req.body.threshold)); } catch (error) { next(error); } };
exports.getThreshold = async (req, res, next) => { try { res.json(await service.threshold(req.user)); } catch (error) { next(error); } };