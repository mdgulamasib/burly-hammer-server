const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET)

const port = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

//jwtverify function 

function JWTVerify(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Access Forbidden' })
        }
        req.decoded = decoded;
        next();
    })

}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xek1w.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


async function run() {
    try {
        await client.connect();
        const productCollection = client.db('burlydB').collection('products');
        const orderCollection = client.db('burlydB').collection('orders');
        const reviewsCollection = client.db('burlydB').collection('reviews');
        const userCollection = client.db('burlydB').collection('users');
        const paymentCollection = client.db('burlydB').collection('payments');


        const verifyAdmin = async (req, JWTVerify, res, next) => {
            const requester = req.decoded?.email;
            console.log(requester)
            const requesterAccount = await userCollection.findOne({ email: requester });
            console.log(requesterAccount)
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }

        //products loading
        app.get('/products', async (req, res) => {
            const query = {};
            const cursor = productCollection.find(query);
            const products = await cursor.toArray();
            res.send(products);

        })

        //review loading
        app.get('/reviews', async (req, res) => {
            const query = {};
            const cursor = reviewsCollection.find(query);
            const reviews = await cursor.toArray();
            res.send(reviews);

        })

        //purchase single data loading
        app.get('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await productCollection.findOne(query);
            res.send(result);
        });

        // updating available quantity
        app.put('/products/:id', async (req, res) => {
            const id = req.params.id;
            const updateQ = req.body;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    availableQ: updateQ.newAvailableQ,
                }
            };
            const result = await productCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        })

        //adding orders in collection
        app.post("/orders", async (req, res) => {
            const order = req.body;
            const result = await orderCollection.insertOne(order);
            res.json(result);
        });

        //myorder data calling based on email match
        app.get('/myorders', JWTVerify, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email === decodedEmail) {
                const query = { email: email };
                const cursor = orderCollection.find(query);
                const orders = await cursor.toArray();
                res.send(orders);
            }
            else {
                res.status(403).send({ message: 'forbidden access' })
            }
        })

        //cancel order delete from server 
        app.delete('/myorders/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await orderCollection.deleteOne(query);
            res.send(result);
        })

        //patching data for updating 
        app.patch('/orders/:id', JWTVerify, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }

            const result = await paymentCollection.insertOne(payment);
            const updatingPayment = await orderCollection.updateOne(filter, updatedDoc);
            res.send(updatingPayment);
        })


        //individual order for payment
        app.get('/payment/:id', JWTVerify, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const order = await orderCollection.findOne(query);
            res.send(order);
        })


        //load all orders
        app.get('/allorders', JWTVerify, verifyAdmin, async (req, res) => {
            const orders = await orderCollection.find().toArray();
            res.send(orders);
        })



        //posting review to server
        app.post("/reviews", async (req, res) => {
            const review = req.body;
            const result = await reviewsCollection.insertOne(review);
            res.json(result);
        });


        //posting new product to server
        app.post("/products", async (req, res) => {
            const product = req.body;
            const result = await productCollection.insertOne(product);
            res.json(result);
        });

        //user sending to server 
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
            res.send({ result, token });
        });

        // loading user data 
        app.get('/user', JWTVerify, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });

        // Making an admin 
        app.put('/user/admin/:email', JWTVerify, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        //find my information 
        app.get('/myinfo', JWTVerify, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email === decodedEmail) {
                const query = { email: email };
                const cursor = userCollection.find(query);
                const myinfo = await cursor.toArray();
                res.send(myinfo);
            }
            else {
                res.status(403).send({ message: 'forbidden access' })
            }
        })
        //updating phone number of a user
        app.put('/number/:id', async (req, res) => {
            const id = req.params.id;
            const updateItem = req.body;
            console.log(id, updateItem)
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    phone: updateItem.number,
                }
            };
            const result = await userCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        })

        //updating img of a user
        app.put('/img/:id', async (req, res) => {
            const id = req.params.id;
            const image = req.body;
            console.log(id, image)
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    image: image.imgurl,
                }
            };
            console.log(updatedDoc)
            const result = await userCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        })

        //updating address of a user
        app.put('/address/:id', async (req, res) => {
            const id = req.params.id;
            const address = req.body;
            console.log(id, address)
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    address: address.location,
                }
            };
            console.log(updatedDoc)
            const result = await userCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        })


        //finding admin based on role
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        // deleting product from all item list
        app.delete('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            console.log(id, query)
            const result = await productCollection.deleteOne(query);
            res.send(result);
        })

        //payment intent api
        app.post('/create-payment-intent', JWTVerify, async (req, res) => {
            const service = req.body;
            const price = service.totalPrice;
            console.log(service, price)
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        });


    }
    finally {

    }
}

run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('burly is up and running!')
})

app.listen(port, () => {
    console.log(`burly is listening on port ${port}`)
})
