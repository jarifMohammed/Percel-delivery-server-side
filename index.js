
const express = require("express");
require("dotenv").config();
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const stripe = require('stripe')(process.env.Stripe_Key) 

// const stripe = require('stripe')(process.env.Stripe_Key) 
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASS}@cluster0.trszs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with MongoDB Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Database Collections
    const usersCollection = client.db("deliveryDB").collection("users");
    const parcelsCollection = client.db("deliveryDB").collection("parcels");
    const reviewsCollection = client.db("deliveryDB").collection("reviews");
    const paymentCollection = client.db("deliveryDB").collection("payments");

    // Generate JWT Token
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.TOKEN, { expiresIn: "2h" });
      res.send({ token });
    });

    // Middleware to verify JWT token
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "forbidden access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "forbidden access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // Middleware to verify Admin access
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await usersCollection.findOne({ email });
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    // Reviews API
    app.post("/reviews", async (req, res) => {
      const review = req.body;
      try {
        const result = await reviewsCollection.insertOne(review);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to save review" });
      }
    });

    app.get("/reviews", async (req, res) => {
      const reviews = await reviewsCollection.find().toArray();
      res.send(reviews);
    });

    // Parcels API
    app.get("/parcels", async (req, res) => {
      const parcels = await parcelsCollection.find().toArray();
      res.send(parcels);
    });

    app.post("/parcels", async (req, res) => {
      const parcel = req.body;
      const result = await parcelsCollection.insertOne(parcel);
      res.send(result);
    });

    app.get("/parcels/:email", async (req, res) => {
      const email = req.params.email;
      const query = { senderEmail: email };
      const parcels = await parcelsCollection.find(query).toArray();
      res.send(parcels);
    });

    // Fetch specific parcel for update
    app.get("/parcels/update/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await parcelsCollection.findOne(filter);
      res.send(result);
    });

    // Assign Delivery Man to Parcel
    app.patch("/parcels/assign/:id", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const update = {
        $set: {
          deliveryManId: item.deliveryManId,
          approximateDate: item.approximateDate,
          status: item.status,
        },
      };
      const result = await parcelsCollection.updateOne(filter, update);
      res.send(result);
    });

    // Update Parcel Status
    app.patch("/parcels/update/:id", async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const update = { $set: { status: item.status } };
      const result = await parcelsCollection.updateOne(filter, update);
      res.send(result);
    });

    // Update Parcel Details
    app.patch("/parcels/:id", async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: item };
      const result = await parcelsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Update User Information
    app.patch("/users/:email", async (req, res) => {
      const data = req.body;
      const email = req.params.email;
      const filter = { email: email };
      const updatedData = { $set: data };
      const result = await usersCollection.updateOne(filter, updatedData);
      res.send(result);
    });

    // Users API
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // Check if User is Admin
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Unauthorized access" });
      }
      const user = await usersCollection.findOne({ email });
      res.send({ role: user.role });
    });

    // Register New User
    app.post("/users", async (req, res) => {
      const user = req.body;
      const existingUser = await usersCollection.findOne({ email: user.email });
      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // Get Specific User
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      res.send(user);
    });

    // Make User Admin
    app.patch("/users/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { role: "admin" } };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
// Payment intent

app.get("/parcels/payment/:id", async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const result = await parcelsCollection.findOne(filter);
  res.send(result);
});

app.post('/payment',verifyToken,async(req,res) => {
  const payment = req.body
  const paymentResult = await paymentCollection.insertOne(payment)
  res.send(paymentResult)
})

app.post('/create-payment-intent', async (req, res) => {
  try {
    const { price } = req.body;

    if (!price || isNaN(price)) {
      return res.status(400).json({ error: "Invalid price value" });
    }

    const amount = parseInt(price * 100); // Convert to cents

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      payment_method_types: ['card'],
    });

    // console.log("Client Secret:", paymentIntent.client_secret); 

    res.send({
      clientSecret: paymentIntent.client_secret,
    });

  } catch (error) {
    console.error("Error creating payment intent:", error);
    res.status(500).send({ error: "Payment intent creation failed" });
  }
});




  } finally {}
}
run().catch(console.dir);

// Server Initialization
app.get("/", (req, res) => {
  res.send("Database running");
});
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
