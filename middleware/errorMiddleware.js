const errorHandler = (err, req, res, next) => {

console.error("GLOBAL ERROR:", {
  name: err.name,
  code: err.code,
  errno: err.errno,
  sqlState: err.sqlState,
  message: err.message,
  path: req.originalUrl,
  method: req.method
});

 const constraintCodes = new Set(['ER_NO_REFERENCED_ROW_2', 'ER_ROW_IS_REFERENCED_2', 'ER_DUP_ENTRY', 'ER_CHECK_CONSTRAINT_VIOLATED', 'ER_DATA_TOO_LONG']);
 const status = err.status || (constraintCodes.has(err.code) ? (err.code === 'ER_DUP_ENTRY' ? 409 : 400) : 500);
 res.status(status).json({
 message: status < 500 ? (err.publicMessage || (err.code === 'ER_DUP_ENTRY' ? 'A duplicate record already exists' : 'Academic record violates a database constraint')) : "Internal server error"
 });

};

module.exports = errorHandler;