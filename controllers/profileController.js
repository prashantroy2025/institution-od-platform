const service = require('../services/profileService');
const run = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };

exports.get = run(async (req, res) => res.json(await service.get(req.user.id)));
exports.update = run(async (req, res) => res.json(await service.update(req.user.id, req.body)));
exports.upload = run(async (req, res) => res.status(201).json(await service.addDocument(req.user, req.file, req.body.label)));
exports.download = run(async (req, res) => {
    const document = await service.document(req.params.id, req.user);
    const files = require('../utils/learningFileStore');
    res.type(document.mime_type).attachment(document.original_name).send(await files.read(document.storage_key));
});
exports.uploadPhoto = run(async (req, res) => res.status(201).json(await service.setPhoto(req.user, req.file)));
exports.photo = run(async (req, res) => {
    const image = await service.photo(req.user.id);
    res.type(image.mime).set('Cache-Control', 'private, no-cache').send(image.buffer);
});
exports.studentId = run(async (req, res) => res.json(await service.studentId(req.user)));
exports.listSkills = run(async (req, res) => res.json(await service.listSkills(req.user.id)));
exports.addSkill = run(async (req, res) => res.status(201).json(await service.addSkill(req.user, req.body)));
exports.updateSkill = run(async (req, res) => res.json(await service.updateSkill(req.user, req.params.id, req.body)));
exports.removeSkill = run(async (req, res) => res.json(await service.removeSkill(req.user, req.params.id)));
exports.listAchievements = run(async (req, res) => res.json(await service.listAchievements(req.user.id)));
exports.addAchievement = run(async (req, res) => res.status(201).json(await service.addAchievement(req.user, req.body)));
exports.removeAchievement = run(async (req, res) => res.json(await service.removeAchievement(req.user, req.params.id)));
