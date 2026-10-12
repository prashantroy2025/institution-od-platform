const service = require('../services/libraryService');

const send = async (response, file) => {
    const bytes = await require('../utils/learningFileStore').read(file.storageKey);
    response.type(file.mime || 'application/octet-stream').set('Content-Disposition', `attachment; filename="${String(file.name).replace(/["\\\r\n]/g, '_')}"`).send(bytes);
};
const endpoint = (action, status = 200) => async (request, response, next) => {
    try {
        const result = await action(request);
        response.status(status).json(result);
    } catch (error) {
        next(error);
    }
};

exports.list = endpoint(req => service.list(req.query, req.user));
exports.categories = endpoint(() => service.categories());
exports.bookDetails = endpoint(req => service.bookDetails(req.params.id));
exports.create = endpoint(req => service.createBook({ ...req.body, file: req.file }, req.user), 201);
exports.issue = endpoint(req => service.issue(req.body, req.user), 201);
exports.returnCopy = endpoint(req => service.returnCopy(req.params.id, req.user));
exports.myLoans = endpoint(req => service.myLoans(req.user));
exports.renew = endpoint(req => service.renew(req.params.id, req.user));
exports.reserve = endpoint(req => service.reserve(req.params.id, req.user), 201);
exports.myReservations = endpoint(req => service.myReservations(req.user));
exports.cancelReservation = endpoint(req => service.cancelReservation(req.params.id, req.user));
exports.readingHistory = endpoint(req => service.readingHistory(req.user));
exports.fines = endpoint(req => service.fines(req.user));
exports.rules = endpoint(() => service.rules());
exports.saveRule = endpoint(req => service.saveRule(req.body, req.user), 201);
exports.facilities = endpoint(() => service.facilities());
exports.createFacility = endpoint(req => service.createFacility(req.body, req.user), 201);
exports.myBookings = endpoint(req => service.myBookings(req.user));
exports.bookSpace = endpoint(req => service.bookSpace(req.params.id, req.body, req.user), 201);
exports.cancelBooking = endpoint(req => service.cancelBooking(req.params.id, req.user));
exports.settings = endpoint(req => service.settings(req.user));
exports.saveSettings = endpoint(req => service.saveSettings(req.body, req.user));
exports.download = async (request, response, next) => {
    try {
        await send(response, await service.download(request.params.id, request.user));
    } catch (error) {
        next(error);
    }
};
