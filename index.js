const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session');
require('dotenv').config();
const app = express();

// Set up EJS as the view engine
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Configure session middleware
app.use(session({
    secret: process.env.SESSION_SECRET, // Replace with a more secure key in production
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // Cookie expires in 24 hours
}));

// Middleware to check if the user is logged in
function checkLoggedIn(req, res, next) {
    if (!req.session.email) {
        return res.redirect('/login');
    }
    next();
}

// Set up multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Route to render index.ejs
app.get("/", function (req, res) {
    const email = req.session.email;
    let name = null;

    if (email) {
        const users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
        name = users[email]?.name || email.split('@')[0];
    }

    let listings = JSON.parse(fs.readFileSync('listings.json', 'utf8'));

    if (email) {
        listings = Object.entries(listings)
            .filter(([sellerEmail, sellerListings]) => sellerEmail !== email)
            .reduce((acc, [sellerEmail, sellerListings]) => {
                const filteredListings = sellerListings.filter(listing => listing.buyerEmail !== email);
                if (filteredListings.length) {
                    acc[sellerEmail] = filteredListings;
                }
                return acc;
            }, {});
    }

    let allListings = Object.values(listings).flat();
    const marqueeListings = allListings.splice(0, 25);

    const books = allListings.filter(listing => listing.category === 'books');
    const notes = allListings.filter(listing => listing.category === 'notes');
    const instruments = allListings.filter(listing => listing.category === 'instruments');
    const utilities = allListings.filter(listing => listing.category === 'other utilities');

    res.render("index", {
        name,
        marqueeListings,
        books,
        notes,
        instruments,
        utilities,
    });
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
        req.session.email = email;
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
        req.session.email = email;

        res.redirect('/profile');
    } catch (err) {
        console.error("Error during signup:", err);
        res.render('signup', { error: "An error occurred during signup. Please try again." });
    }
});

// Route to render profile.ejs (Requires login)
app.get("/profile", checkLoggedIn, function (req, res) {
    const email = req.session.email;
    const users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
    const name = users[email]?.name || email.split('@')[0];

    let listings = [];
    let orders = [];

    try {
        const data = JSON.parse(fs.readFileSync('listings.json', 'utf8'));

        if (data[email]) {
            listings = data[email].map(listing => ({
                ...listing,
                image: `data:image/jpeg;base64,${listing.image}`,
                sellerEmail: email // Include the seller's email
            }));
        }

        for (let sellerEmail in data) {
            const userOrders = data[sellerEmail].filter(listing => listing.buyerEmail === email);
            orders.push(...userOrders.map(order => ({
                ...order,
                image: `data:image/jpeg;base64,${order.image}`,
                sellerEmail // Include the seller's email
            })));
        }

        res.render("profile", { email, name, listings, orders });
    } catch (err) {
        console.error("Error reading listings.json:", err);
        res.render("profile", { email, name, listings, orders });
    }
});


// Route to sign out
app.post("/signout", function (req, res) {
    req.session.destroy(err => {
        if (err) {
            console.error("Error during signout:", err);
        }
        res.redirect('/');
    });
});

// Route to render list.ejs (Requires login)
app.get("/list", checkLoggedIn, function (req, res) {
    const email = req.session.email;
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

    if (!listings[req.session.email]) {
        listings[req.session.email] = [];
    }
    listings[req.session.email].push(listing);

    fs.writeFileSync('listings.json', JSON.stringify(listings, null, 2));

    res.redirect('/profile');
});

// Route to render product.ejs (Handles the /product/:id route)
app.get("/product/:id", (req, res) => {
    const { id } = req.params;
    const listings = JSON.parse(fs.readFileSync('listings.json', 'utf8'));
    
    let product = null;
    for (let sellerEmail in listings) {
        const foundProduct = listings[sellerEmail].find(listing => listing.id === id);
        if (foundProduct) {
            product = foundProduct;
            break;
        }
    }

    if (product) {
        console.log(product); // Log product details
        res.render("product", { product, name: req.session.email ? req.session.email.split('@')[0] : null });
    } else {
        res.status(404).send("Product not found");
    }
});

// Route to handle purchasing a product
app.get("/buy/:id", checkLoggedIn, (req, res) => {
    const { id } = req.params;
    const listings = JSON.parse(fs.readFileSync('listings.json', 'utf8'));

    let product = null;
    for (let sellerEmail in listings) {
        const foundProduct = listings[sellerEmail].find(listing => listing.id === id);
        if (foundProduct) {
            product = foundProduct;
            break;
        }
    }

    if (product) {
        res.render("buy", { product, name: req.session.email ? req.session.email.split('@')[0] : null });
    } else {
        res.status(404).send("Product not found");
    }
});

// Route to complete a purchase
app.post("/complete-purchase", checkLoggedIn, (req, res) => {
    const { productId } = req.body;
    const listings = JSON.parse(fs.readFileSync('listings.json', 'utf8'));
    const email = req.session.email;

    for (let sellerEmail in listings) {
        const productIndex = listings[sellerEmail].findIndex(listing => listing.id === productId);
        if (productIndex !== -1) {
            listings[sellerEmail][productIndex].buyerEmail = email;
            fs.writeFileSync('listings.json', JSON.stringify(listings, null, 2));
            return res.redirect("/profile");
        }
    }

    res.status(404).send("Product not found or already sold");
});

// Route to display edit form
app.get('/edit/:id', checkLoggedIn, (req, res) => {
    const productId = req.params.id;
    const listings = JSON.parse(fs.readFileSync('listings.json', 'utf8'));
    const email = req.session.email;

    let product = null;

    // Find the product by id within the user's listings
    if (listings[email]) {
        product = listings[email].find(listing => listing.id === productId);
    }

    if (product) {
        res.render('edit', { product, email });
    } else {
        res.redirect('/profile');
    }
});

// Route to handle form submission
app.post('/edit/:id', upload.single('productImage'), (req, res) => {
    const productId = req.params.id;
    const { productName, productTitle, productPrice, productCategory } = req.body;
    const email = req.session.email;
    let listings = JSON.parse(fs.readFileSync('listings.json', 'utf8'));

    if (listings[email]) {
        let listingIndex = listings[email].findIndex(listing => listing.id === productId);

        if (listingIndex !== -1) {
            const listing = listings[email][listingIndex];

            // Update mutable fields
            listing.name = productName;
            listing.title = productTitle;
            listing.price = productPrice;

            // Retain the existing image if no new image is uploaded
            if (req.file) {
                listing.image = req.file.buffer.toString('base64');
            }

            // Save updated listings back to the file
            fs.writeFileSync('listings.json', JSON.stringify(listings, null, 2));

            return res.redirect('/profile');
        }
    }

    res.status(404).send("Product not found or you're not authorized to edit this listing");
});

// Start the server
app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});