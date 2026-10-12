const service = require('../services/attendanceStudentService');

const respond = (action) => async (req, res, next) => {
    try { res.json(await action(req)); } catch (error) { next(error); }
};

exports.semesters = respond((req) => service.semesters(req.user));
exports.analytics = respond((req) => service.analytics(req.query, req.user));
exports.records = respond((req) => service.records(req.query, req.user));
exports.listLeave = respond((req) => service.listLeave(req.query, req.user));
exports.decideLeave = respond((req) => service.decideLeave(req.params.id, req.body, req.user));

exports.createLeave = async (req, res, next) => {
    try { res.status(201).json(await service.createLeave(req.user, req.body, req.file)); } catch (error) { next(error); }
};

exports.leaveDocument = async (req, res, next) => {
    try {
        const document = await service.leaveDocument(req.params.id, req.user);
        res.type(document.mime || 'application/octet-stream').attachment(document.name || 'leave-document').send(document.buffer);
    } catch (error) { next(error); }
};
