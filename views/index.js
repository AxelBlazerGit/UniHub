const express=require("express")
const path=require("path")
const app=express()
const fs=require("fs")
const mongoose=require("mongoose")

app.set("view engine","ejs")
app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(express.static(path.join(__dirname,"public")))

app.get("/",function(req,res){
    fs.readdir(`./files`,function(err,files){
        res.render("index",{files:files})
    })
})

app.post("/create", function(req, res) {
    fs.writeFile(`./files/${req.body.taskTitle.split(" ").join('') + '.txt'}`, req.body.taskBody, function(err) {
        res.redirect("/");
    });
});

app.get("/file/:filename",function(req,res){
    fs.readFile(`./files/${req.params.filename}`,"utf-8",function(e,filedata){
        res.render("show", {filename: req.params.filename, filedata: filedata})
    })
})

app.get("/edit/:filename",function(req,res){
    res.render('edit',{filename: req.params.filename})
})

app.post("/edit",function(req,res){
    // console.log(req.body);
    // fs.rename(`./files/${req.body.previous}+'.txt'`,`./files/${req.body.new}+'.txt'`)
    const previousFilename = req.body.previous + '.txt';
    const newFilename = req.body.new.split(" ").join("") + '.txt';

    fs.rename(`./files/${previousFilename}`, `./files/${newFilename}`,function(e){
        res.redirect("/")
    })
})

app.listen(3000)