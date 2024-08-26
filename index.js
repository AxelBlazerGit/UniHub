const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const app = express();

// Simulated session storage (in-memory for this example)
let session = {};

app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Middleware to check if the user is logged in
function checkLoggedIn(req, res, next) {
    const email = session.email;
    if (!email) {
        return res.redirect('/login');
    }
    next();
}

// Set up multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Route to render index.ejs
app.get("/", function (req, res) {
    const email = session.email;
    const name = email ? email.split('@')[0] : null;
    res.render("index", { name });
});

// Route to render login.ejs
app.get("/login", function (req, res) {
    res.render("login", { error: null });
});

// Route to handle login logic
app.post("/login", function (req, res) {
    const { email, password } = req.body;
    let users = JSON.parse(fs.readFileSync('users.json'));

    if (users[email] && users[email].password === password) {
        session.email = email;
        return res.redirect('/profile');
    } else {
        return res.render('login', { error: "Invalid email or password" });
    }
});

// Route to render signup.ejs
app.get("/signup", function (req, res) {
    res.render("signup", { error: null });
});

// Route to handle signup logic
app.post("/signup", function (req, res) {
    try {
        const { name, email, city, institution, password } = req.body;

        if (!name || !email || !city || !institution || !password) {
            return res.render('signup', { error: "All fields are required" });
        }

        let users = JSON.parse(fs.readFileSync('users.json', 'utf8'));

        if (users[email]) {
            return res.render('signup', { error: "Email is already registered" });
        }

        if (password.length < 8) {
            return res.render('signup', { error: "Password must be at least 8 characters long" });
        }

        users[email] = { name, city, institution, password };
        fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
        session.email = email;

        res.redirect('/profile');
    } catch (err) {
        console.error("Error during signup:", err);
        res.render('signup', { error: "An error occurred during signup. Please try again." });
    }
});

// Route to render profile.ejs (Requires login)
app.get("/profile", checkLoggedIn, function (req, res) {
    const email = session.email;
    const name = email.split('@')[0];

    let listings = [];
    let orders = [];

    try {
        const data = JSON.parse(fs.readFileSync('listings.json'));

        if (data[email]) {
            listings = data[email].map(listing => ({
                ...listing,
                image: `data:image/jpeg;base64,${listing.image}` // Convert base64 to image URL
            }));
        }

        for (let sellerEmail in data) {
            const userOrders = data[sellerEmail].filter(listing => listing.buyerEmail === email);
            orders.push(...userOrders.map(order => ({
                ...order,
                image: `data:image/jpeg;base64,${order.image}` // Convert base64 to image URL
            })));
        }

        res.render("profile", { name, listings, orders });
    } catch (err) {
        console.error("Error reading listings.json:", err);
        res.render("profile", { name, listings, orders });
    }
});

// Route to sign out
app.post("/signout", function (req, res) {
    session = {}; // Clear the session
    res.redirect('/');
});

// Route to render list.ejs (Requires login)
app.get("/list", checkLoggedIn, function (req, res) {
    const email = session.email;
    res.render("list", { email });
});

// Route to handle product listing logic (Requires login)
app.post("/list", checkLoggedIn, upload.single('productImage'), function (req, res) {
    const { productName, productTitle, productPrice, productCategory, buyerEmail } = req.body;
    const productImage = req.file.buffer.toString('base64');

    let listings = JSON.parse(fs.readFileSync('listings.json'));

    const listing = {
        id: Math.random().toString(36).substr(2, 32),
        title: productTitle,
        description: productName,
        price: productPrice,
        category: productCategory,
        image: productImage,
        buyerEmail: buyerEmail || null
    };

    if (!listings[session.email]) {
        listings[session.email] = [];
    }
    listings[session.email].push(listing);

    fs.writeFileSync('listings.json', JSON.stringify(listings, null, 2));

    res.redirect('/profile');
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
