const mysql = require('mysql2/promise');
const dbConfig = require('../config/db').getDbConfig();
const files = require('../utils/learningFileStore');

function assertSafeTarget(env = process.env, database = env.DB_NAME || env.MYSQLDATABASE) {
    if (!['development', 'test'].includes(String(env.NODE_ENV || '').toLowerCase())) throw new Error('Academic demo seed requires NODE_ENV=development or NODE_ENV=test');
    if (database !== 'institution_od_demo') throw new Error('Academic demo seed may only use the explicit institution_od_demo database');
    if (env.DB_NAME && env.MYSQLDATABASE && env.DB_NAME !== env.MYSQLDATABASE) throw new Error('DB_NAME and MYSQLDATABASE must agree');
}

async function seed(connection) {
    const [dbRows] = await connection.query('SELECT DATABASE() database_name');
    if (dbRows[0]?.database_name !== 'institution_od_demo') throw new Error('Connected database verification failed');
    const [students] = await connection.query(`SELECT u.id student_id,sp.batch_id,sp.section_id,b.course_id,b.session_id,c.department_id
        FROM erp_college_demo_registry r JOIN users u ON u.id=r.related_id
        JOIN student_profiles sp ON sp.user_id=u.id JOIN batches b ON b.id=sp.batch_id JOIN courses c ON c.id=b.course_id
        WHERE r.entity_type='student' AND sp.section_id IS NOT NULL ORDER BY r.demo_id LIMIT 1`);
    if (!students[0]) throw new Error('No demo student is linked to a course, batch, and section; run the existing demo import first');
    const student=students[0];
    const [semesters] = await connection.query(`SELECT id,number,name FROM semesters WHERE session_id=? ORDER BY number DESC LIMIT 1`,[student.session_id]);
    if (!semesters[0]) throw new Error('The demo student batch has no academic semester');
    const semester=semesters[0];
    const [subjects] = await connection.query('SELECT id,code,name,credits FROM subjects WHERE course_id=? AND semester_id=? AND is_active=1 ORDER BY code',[student.course_id,semester.id]);
    if (!subjects.length) throw new Error('No active subjects are linked to the demo student course and semester');
    const demoSubject=subjects[0];
    const [staffRows] = await connection.query(`SELECT t.faculty_id FROM timetable_entries t
        WHERE t.session_id=? AND t.semester_id=? AND t.batch_id=? AND t.section_id=? ORDER BY t.weekday,t.start_time LIMIT 1`,[student.session_id,semester.id,student.batch_id,student.section_id]);
    const [facultyRows] = await connection.query(`SELECT u.id FROM users u JOIN faculty_profiles fp ON fp.user_id=u.id
        WHERE u.department_id=? AND u.role IN ('hod','organizer') AND u.is_active=1 AND (u.deleted=0 OR u.deleted IS NULL) ORDER BY u.id LIMIT 1`,[student.department_id]);
    const connectionId=staffRows[0]?.faculty_id || facultyRows[0]?.id || null;

    await connection.beginTransaction();
    const storedKeys=[];
    try {
        let classroomId=null;
        if(connectionId){
            const roomCode=`DEMO-ACA-${student.department_id}`;
            const [rooms]=await connection.query('SELECT id FROM classrooms WHERE department_id=? AND code=? LIMIT 1',[student.department_id,roomCode]);
            if(rooms[0]) classroomId=rooms[0].id;
            else {const [room]=await connection.query('INSERT INTO classrooms(department_id,code,name,capacity,is_active,created_by) VALUES(?,?,?,40,1,?)',[student.department_id,roomCode,'Demo Academic Room',connectionId]);classroomId=room.insertId;}
            for(const subject of subjects.slice(0,5)){
                const [scheduled]=await connection.query('SELECT id FROM timetable_entries WHERE session_id=? AND semester_id=? AND subject_id=? AND batch_id=? AND section_id=? LIMIT 1',[student.session_id,semester.id,subject.id,student.batch_id,student.section_id]);
                if(scheduled.length) continue;
                let slot=null;
                for(let weekday=1;weekday<=5&&!slot;weekday++) for(let hour=9;hour<=15&&!slot;hour++){
                    const start=`${String(hour).padStart(2,'0')}:00:00`,end=`${String(hour+1).padStart(2,'0')}:00:00`;
                    const [conflicts]=await connection.query(`SELECT id FROM timetable_entries WHERE session_id=? AND semester_id=? AND weekday=?
                        AND start_time<? AND end_time>? AND (faculty_id=? OR classroom_id=? OR section_id=?) LIMIT 1`,[student.session_id,semester.id,weekday,end,start,connectionId,classroomId,student.section_id]);
                    if(!conflicts.length) slot={weekday,start,end};
                }
                if(slot) await connection.query(`INSERT INTO timetable_entries(session_id,semester_id,subject_id,batch_id,section_id,faculty_id,classroom_id,weekday,start_time,end_time,created_by)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?)`,[student.session_id,semester.id,subject.id,student.batch_id,student.section_id,connectionId,classroomId,slot.weekday,slot.start,slot.end,connectionId]);
            }
        }
        if(connectionId) await connection.query('UPDATE sections SET advisor_id=? WHERE id=? AND advisor_id IS NULL',[connectionId,student.section_id]);
        const [existingUnits] = await connection.query('SELECT id FROM syllabus_units WHERE subject_id=? AND unit_number=1',[demoSubject.id]);
        if (!existingUnits.length) await connection.query(`INSERT INTO syllabus_units(subject_id,unit_number,title,topics,learning_outcomes,created_by)
            VALUES(?,1,?,?,?,?)`,[demoSubject.id,`Demo unit: ${demoSubject.name}`,'Foundations and core terminology\nKey concepts and models','Explain core concepts and apply them to examples',connectionId]);
        const calendarEntries=[
            ['Demo academic calendar: Orientation','Academic Event',0],
            ['Demo academic calendar: Study break','Holiday',7],
            ['Demo academic calendar: Registration deadline','Registration Deadline',14]
        ];
        for(const [title,type,days] of calendarEntries){
            const [found]=await connection.query('SELECT id FROM academic_calendar_events WHERE title=? AND session_id=? LIMIT 1',[title,student.session_id]);
            if(!found.length) await connection.query(`INSERT INTO academic_calendar_events(session_id,semester_id,title,event_type,starts_on,ends_on,description,is_published,created_by)
                VALUES(?,?,?, ?,DATE_ADD(CURRENT_DATE,INTERVAL ? DAY),DATE_ADD(CURRENT_DATE,INTERVAL ? DAY),'DEMO DATA — not an official institutional date',1,?)`,[student.session_id,semester.id,title,type,days,days,connectionId]);
        }
        if(connectionId){
            for(const [index,subject] of subjects.slice(0,3).entries()){
                const assignmentTitle=`DEMO — ${subject.code} practice assignment ${index+1}`;
                const [assignment]=await connection.query('SELECT id FROM learning_assignments WHERE subject_id=? AND batch_id=? AND section_id=? AND title=? LIMIT 1',[subject.id,student.batch_id,student.section_id,assignmentTitle]);
                if(!assignment.length) await connection.query(`INSERT INTO learning_assignments(subject_id,batch_id,section_id,created_by,title,instructions,publish_at,deadline,max_marks,status)
                    VALUES(?,?,?,?,?,'DEMO DATA — submit practice work for feedback',NOW(),DATE_ADD(NOW(),INTERVAL ? DAY),10,'Published')`,[subject.id,student.batch_id,student.section_id,connectionId,assignmentTitle,5+(index*5)]);
            }
        }
        const [material] = await connection.query('SELECT id FROM learning_materials WHERE subject_id=? AND title=? LIMIT 1',[demoSubject.id,`DEMO — ${demoSubject.code} study notes`]);
        if(connectionId && !material.length){
            const buffer=Buffer.from(`DEMO DATA — ${demoSubject.name}\n\nThis fictional study resource is for development testing only.\n`);
            const file={buffer,size:buffer.length,originalname:`${demoSubject.code}-demo-notes.txt`,mimetype:'text/plain'};
            const storedKey=await files.save(file);storedKeys.push(storedKey);
            await connection.query(`INSERT INTO learning_materials(subject_id,course_id,created_by,title,description,storage_key,original_name,mime,size)
                VALUES(?,?,?,?,?,?,?,?,?)`,[demoSubject.id,student.course_id,connectionId,`DEMO — ${demoSubject.code} study notes`,'Development-only sample learning material',storedKey,file.originalname,file.mimetype,file.size]);
        }
        const [registration] = await connection.query('SELECT id FROM academic_course_registrations WHERE student_id=? AND session_id=? AND semester_id=? AND subject_id=?',[student.student_id,student.session_id,semester.id,demoSubject.id]);
        if(!registration.length) await connection.query('INSERT INTO academic_course_registrations(student_id,session_id,semester_id,subject_id,status) VALUES(?,?,?,?,?)',[student.student_id,student.session_id,semester.id,demoSubject.id,'Pending']);
        const requestText='DEMO DATA — example request for academic guidance';
        const [request] = await connection.query('SELECT id FROM academic_requests WHERE student_id=? AND request_type=? AND details=? LIMIT 1',[student.student_id,'Advisor Appointment',requestText]);
        if(!request.length) await connection.query('INSERT INTO academic_requests(student_id,request_type,subject_id,details) VALUES(?,?,?,?)',[student.student_id,'Advisor Appointment',demoSubject.id,requestText]);
        await connection.commit();
        return {student_id:student.student_id,subject_id:demoSubject.id,faculty_assignment:Boolean(connectionId),created:['syllabus unit','calendar examples','assignment if timetable exists','private learning material','registration request','academic request']};
    }catch(error){await connection.rollback();await Promise.all(storedKeys.map(key=>files.remove(key)));throw error;}
}

async function main(){
    assertSafeTarget();
    const connection=await mysql.createConnection({...dbConfig,database:'institution_od_demo',multipleStatements:false});
    try{console.log(JSON.stringify(await seed(connection),null,2));}finally{await connection.end();}
}

if(require.main===module) main().catch(error=>{console.error(`Academic demo seed refused/failed: ${error.message}`);process.exitCode=1;});
module.exports={assertSafeTarget,seed};
