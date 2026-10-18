"""Development-only original demo curriculum."""
from .database import Base, engine, SessionLocal
from .models import *
from .main import pwd
from .core.config import get_settings
from sqlalchemy import select
def run():
    if get_settings().app_env == "production": raise SystemExit("Demo seed is disabled in production")
    Base.metadata.create_all(engine); db=SessionLocal()
    if db.scalar(select(User.id).limit(1)): print("Seed skipped: data already exists"); return
    teacher=User(display_name="Demo Teacher",email="teacher@guruji.demo",password_hash=pwd.hash("DemoPass123!"),role=Role.TEACHER); learner=User(display_name="Demo Learner",email="learner@guruji.demo",password_hash=pwd.hash("DemoPass123!"),role=Role.LEARNER);db.add_all([teacher,learner]);db.flush();cl=Class(name="Demo Class 6",teacher_id=teacher.id);db.add(cl);db.flush();db.add(ClassMembership(class_id=cl.id,learner_id=learner.id))
    maths=Subject(name="Mathematics",class_level=6); science=Subject(name="Science",class_level=6);db.add_all([maths,science]);db.flush()
    specs=[(maths,"Fractions","Fractions","A fraction names equal parts of a whole.",[('Equal parts','A fraction has a numerator above a denominator. The denominator tells how many equal parts make the whole; the numerator tells how many parts are chosen.'),('Comparing fractions','When denominators match, the greater numerator makes the greater fraction. Convert to equivalent fractions when denominators differ.')]),(science,"Photosynthesis","Photosynthesis","Plants make food using light, water and carbon dioxide.",[('What plants need','Green plants use sunlight, water from roots and carbon dioxide from air to make sugar. Chlorophyll captures light.'),('What plants produce','Photosynthesis releases oxygen. The sugar is food the plant can use for energy and growth.')])]
    for subject,title,topic,summary,sections in specs:
      l=Lesson(subject_id=subject.id,title=title,topic=topic,class_level=6,summary=summary);db.add(l);db.flush();db.add_all([LessonSection(lesson_id=l.id,heading=h,passage=p,position=i) for i,(h,p) in enumerate(sections,1)]);db.add(LessonSource(lesson_id=l.id,attribution="Original GURUJI BOX educational content",license="CC BY 4.0"));q=Quiz(lesson_id=l.id,title=title+" quiz");db.add(q);db.flush()
      base=[("What does the denominator show?",["Equal parts in the whole","Chosen parts","The answer","The colour"],"Equal parts in the whole"),("Which statement is true?",["Plants need light","Plants make sunlight","Plants do not need water","Oxygen makes sugar"],"Plants need light")]
      for i in range(8):
       prompt,choices,answer=base[i%2];db.add(Question(quiz_id=q.id,prompt=prompt,choices=choices,answer=answer,explanation="Review the lesson section and try again.",topic=topic))
    course=SkillCourse(title="Digital Literacy for Beginners",description="Practical foundations for computers, smartphones and safer internet use.");db.add(course);db.flush()
    for i,(t,b) in enumerate([("Devices","Identify basic computer and smartphone controls."),("Internet search","Use specific queries and check the source."),("Email and passwords","Use unique passphrases and recognise phishing."),("Responsible tools","Pause before sharing personal information.")],1):db.add(SkillLesson(course_id=course.id,title=t,body=b,position=i))
    db.commit();print("Seeded demo teacher and learner. Password: DemoPass123!")
if __name__=="__main__": run()
