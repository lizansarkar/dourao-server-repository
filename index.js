const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
//stripe requre key
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 3000;

//middlewete
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@lizan0.tl45evy.mongodb.net/?appName=lizan0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("dourao_DB");
    const parcelsCollection = db.collection("parcels");
    const paymentCollection = db.collection("payments");
    const userCollection = db.collection("users");
    const riderCollection = db.collection("riders");

    //riders realeted api ************
    app.patch('/riders/:id', async (req, res) => {
      const status = req.body.status;
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const updateDoc = {
        $set: {
          status: status
        }
      }

      const result = await riderCollection.updateOne(query, updateDoc);
      res.send(result)
    })

    app.post('/riders', async (req, res) => {
      const rider = req.body;
      rider.status = 'pending';
      rider.createdAt = new Date();

      const result = await riderCollection.insertOne(rider)
      res.send(result)
    })

    app.get('/riders', async (req, res) => {
      const query = {}
      if(req.query.status){
        query.status = req.query.status;
      }
      const cursor = riderCollection.find(query)
      const result = await cursor.toArray();
      res.send(result);
    })

    //user realeted api ************
    app.post('/users', async (req, res) => {
      const user = req.body;
      user.role = 'user';
      user.createdAt = new Date();

      const email = user.email;
      const userExists = await userCollection.findOne({email})

      if(userExists) {
        return res.send({message: "user exist"})
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    })


    //parcel api here
    //get parcel data
    app.get("/parcels", async (req, res) => {
      const query = {};
      const { email } = req.query;

      if (email) {
        query.senderEmail = email;
      }

      const options = { sort: { createdAt: -1 } };

      const cursor = parcelsCollection.find(query, options);
      const result = await cursor.toArray();

      res.send(result);
    });

    //get payment paid or non paid data
    app.get("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelsCollection.findOne(query);

      res.send(result);
    });

    // add parcel data
    app.post("/parcels", async (req, res) => {
      const parcel = req.body;
      //for time dekhar ar jonne
      parcel.createdAt = new Date();
      const result = await parcelsCollection.insertOne(parcel);

      res.send(result);
    });

    //delte parcel data
    app.delete("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelsCollection.deleteOne(query);

      res.send(result);
    });

    //stripe payment raleted api

    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      console.log(paymentInfo)
      const amount = parseInt(paymentInfo.cost) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: `Please pay for: ${paymentInfo.parcelName}`,
              },
            },
            quantity: 2,
          },
        ],
        mode: "payment",
        metadata: {
          parcelId: paymentInfo.parcelId,
        },
        customer_email: paymentInfo.senderEmail,
        success_url: `${process.env.STRIPE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.STRIPE_DOMAIN}/dashboard/payment-cancelled`,
      });

      res.send({url: session.url})
    });

    // app.post("/create-checkout-session", async (req, res) => {

    //   const paymentInfo = req.body;
    //   const amount = parseInt(paymentInfo.cost) * 100;

    //   const session = await stripe.checkout.sessions.create({
    //     line_items: [
    //       {
    //         // Provide the exact Price ID (for example, price_1234) of the product you want to sell
    //         price_data: {
    //           currency: "usd",
    //           unit_amount: amount,
    //           product_data: {
    //             name: paymentInfo.parcelName,
    //           },
    //         },
    //         quantity: 1,
    //       },
    //     ],
    //     customer_email: paymentInfo.senderEmail,
    //     mode: "payment",
    //     metadata: {
    //       parcelId: paymentInfo.parcelId,
    //     },
    //     success_url: `${process.env.STRIPE_DOMAIN}/dashboard/payment-success`,
    //     cancel_url: `${process.env.STRIPE_DOMAIN}/dashboard/payment-cancelled`,
    //   });

    //   console.log(session);
    //   res.send({url: session.url})
    // });

    // Stripe payment related API
    
    app.post("/create-checkout-session", async (req, res) => {
      try {
        const paymentInfo = req.body;

        // Debug করার জন্য
        console.log("Received payment info:", paymentInfo);
        console.log("Cost value:", paymentInfo.cost);

        // Validate cost
        if (!paymentInfo.cost || isNaN(paymentInfo.cost)) {
          return res.status(400).send({
            error: "Invalid cost value",
            received: paymentInfo.cost,
          });
        }

        // Parse and convert to cents
        const amount = Math.round(parseFloat(paymentInfo.cost) * 100);

        console.log("Calculated amount in cents:", amount);

        // Validate amount
        if (amount <= 0 || isNaN(amount)) {
          return res.status(400).send({
            error: "Amount must be greater than 0",
            calculatedAmount: amount,
          });
        }

        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: amount,
                product_data: {
                  name: paymentInfo.parcelName || "Parcel Delivery",
                },
              },
              quantity: 1,
            },
          ],
          customer_email: paymentInfo.senderEmail,
          mode: "payment",
          metadata: {
            parcelId: paymentInfo.parcelId,
          },
          success_url: `${process.env.STRIPE_DOMAIN}/dashboard/payment-success`,
          cancel_url: `${process.env.STRIPE_DOMAIN}/dashboard/payment-cancelled`,
        });

        console.log("Session created:", session.id);
        res.send({ url: session.url });
      } catch (error) {
        console.error("Stripe error:", error);
        res.status(500).send({
          error: error.message,
          details: error.raw?.message,
        });
      }
    });

    app.patch('/payment-success', async (req, res) => {
      const sessionId = req.query.session_id;

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log('session retripe', session)
      if(session.payment_status = 'paid') {
        const id = session.metadata.parcelId;
        const query = {_id: new ObjectId(id)}
        const update = {
          $set: {
            paymentStatus: 'paid',
          }
        }

        const result = await parcelsCollection.updateOne(query, update);
        res.send(result);
      }

      res.send({success: false})
    })

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Dourao server is running???????");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
