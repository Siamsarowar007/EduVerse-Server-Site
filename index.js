const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

// middleware
app.use(cors());
app.use(express.json());

// mongodb

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.soctnyt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();

    // Collections

    const courseCollection = client.db("eduVerse").collection("courses");
    const enrollmentCollection = client
      .db("eduVerse")
      .collection("enrollments");
    const feedbackCollection = client.db("eduVerse").collection("feedbacks");

    // Course get
    app.post("/courses", async (req, res) => {
      const newCourses = req.body;
      console.log(newCourses);
      const result = await courseCollection.insertOne(newCourses);
      res.send(result);
    });

    // course api
    app.get("/courses", async (req, res) => {
      const cursor = courseCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // /coursesDetails
    app.get("/courses/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await courseCollection.findOne(query);
      res.send(result);
    });

    // ********************
    app.get("/courses/:id", async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid course ID" });
      }

      const query = { _id: new ObjectId(id) };
      const result = await courseCollection.findOne(query);

      if (!result) {
        return res.status(404).send({ message: "Course not found" });
      }

      res.send(result);
    });


    // get courses by user email
    app.get("/my-courses", async (req, res) => {
      try {
        const userEmail = req.query.email;
        if (!userEmail) {
          return res.status(400).send({ message: "Email is required" });
        }

        const query = { instructorEmail: userEmail };
        const userCourses = await courseCollection.find(query).toArray();
        res.send(userCourses);
      } catch (error) {
        console.error("Failed to fetch user's courses:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // delete course
    app.delete("/courses/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await courseCollection.deleteOne(query);
      res.send(result);
    });

    // Update course by ID
    app.put("/courses/:id", async (req, res) => {
      const id = req.params.id;
      const updatedCourse = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: updatedCourse };
      const result = await courseCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // popular_courses api

    app.get("/popular-courses", async (req, res) => {
      try {
        const enrollments = await enrollmentCollection.find().toArray();

        const courseCount = {};

        enrollments.forEach((enroll) => {
          const courseId = enroll.courseId;
          if (courseCount[courseId]) {
            courseCount[courseId]++;
          } else {
            courseCount[courseId] = 1;
          }
        });

        //  sort popular course .
        const sortedCourses = Object.entries(courseCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4);

        //  course details  ..
        const popularCourses = [];

        for (let [courseId, count] of sortedCourses) {
          const course = await courseCollection.findOne({
            _id: new ObjectId(courseId),
          });
          if (course) {
            course.enrollCount = count;
            popularCourses.push(course);
          }
        }

        res.send(popularCourses);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Something went wrong!" });
      }
    });

    // Get all enrollments of a user
    app.get("/enrollments/:email", async (req, res) => {
      const email = req.params.email;

      const result = await enrollmentCollection
        .find({ userEmail: email })
        .toArray();

      res.send(result);
    });

    app.get("/my-enrollments", async (req, res) => {
      const userEmail = req.query.email;

      // find enrollments
      const enrollments = await enrollmentCollection
        .find({ userEmail })
        .toArray();

      //for each enrollment, get course data
      const enrichedEnrollments = await Promise.all(
        enrollments.map(async (enrollment) => {
          const course = await courseCollection.findOne({
            _id: new ObjectId(enrollment.courseId),
          });

          return {
            _id: enrollment._id,
            enrolledAt: enrollment.enrolledAt,
            courseTitle: course?.course_title,
            photo: course?.photo,
            instructorName: course?.instructorName,
            duration: course?.duration,
            courseId: enrollment.courseId,
          };
        })
      );

      res.send(enrichedEnrollments);
    });

    // Delete enrollment
    app.delete("/enrollments/:id", async (req, res) => {
      const id = req.params.id;
      const courseId = req.query.courseId;
      console.log("courseid", courseId);

      const query = { _id: new ObjectId(id) };
      const filter = { _id: new ObjectId(courseId) };
      const course = await courseCollection.findOne(filter);
      console.log(course.availableSeats);
      const availableSeats = course.availableSeats + 1;
      console.log(availableSeats);

      const updateDoc = {
        $set: { availableSeats },
      };
      await courseCollection.updateOne(filter, updateDoc);
      const result = await enrollmentCollection.deleteOne(query);
      res.send(result);
    });

    // Enroll API
    app.post("/enrollments", async (req, res) => {
      const { userEmail, courseId } = req.body;
      console.log("this", courseId);

      // enrolled
      const existingEnrollment = await enrollmentCollection.findOne({
        userEmail,
        courseId,
      });

      const course = await courseCollection.findOne({
        _id: new ObjectId(courseId),
      });
      console.log(course);
      const availableSeats = course.availableSeats - 1;

      const enrollments = await enrollmentCollection
        .find({ userEmail })
        .toArray();
      console.log(enrollments.length);

      if (existingEnrollment) {
        return res.send({ enrolled: false, message: "Already enrolled" });
      }
      if (enrollments.length > 2) {
        return res.send({
          enrolled: false,
          message: "You can not enroll more then 3 courses",
        });
      }

      const filter = { _id: new ObjectId(courseId) };
      const updateDoc = {
        $set: { availableSeats },
      };
      await courseCollection.updateOne(filter, updateDoc);
      //  new enrollment
      const result = await enrollmentCollection.insertOne({
        userEmail,
        courseId,
      });
      console.log(result);
      res.send({ enrolled: true, insertedId: result.insertedId });
    });

    // **
    // Express.js Backend
    app.delete("/enrollments/cancel", async (req, res) => {
      const { email, courseId } = req.body;
      const result = await enrollmentCollection.deleteOne({
        userEmail: email,
        courseId: courseId,
      });

      if (result.deletedCount > 0) {
        //  increment seat if needed
        await courseCollection.updateOne(
          { _id: new ObjectId(courseId) },
          { $inc: { availableSeats: 1 } }
        );
      }

      res.send(result);
    });

   

    // gET all feedback
    app.get("/feedbacks", async (req, res) => {
      const feedbacks = await feedbackCollection.find({}).toArray();
      res.send(feedbacks);
    });

    // Feedback API
    app.post("/feedbacks", async (req, res) => {
      try {
        const feedback = req.body;

        if (!feedback.name || !feedback.email || !feedback.message) {
          return res.status(400).send({ message: "All fields are required" });
        }

        const result = await feedbackCollection.insertOne(feedback);
        res.send(result);
      } catch (error) {
        console.error("Error inserting feedback:", error);
        res.status(500).send({ message: "Failed to submit feedback." });
      }
    });

    // patch feedback update
    app.patch("/feedbacks/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      const result = await feedbackCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );
      res.send(result);
    });

    // Update Feedback
    app.put("/feedbacks/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const result = await feedbackCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );

      res.send(result);
    });

    // DELETE feedback
    app.delete("/feedbacks/:id", async (req, res) => {
      const id = req.params.id;
      const result = await feedbackCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // update the previous course
    app.put("/courses/:id", async (req, res) => {
      const id = req.params.id;
      const updatedCourse = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: updatedCourse,
      };
      const result = await courseCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // delete course
    app.delete("/courses/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await courseCollection.deleteOne(query);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("EduVerse is Cooking!");
});

app.listen(port, () => {
  console.log(`EduVerse Server is running on port ${port}`);
});
