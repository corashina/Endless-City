# Endless City 🏢
WebGL city scene heavily inspired by https://demos.littleworkshop.fr/infinitown

## Demo
https://corashina.github.io/Endless-City

## Running the project locally
If you just open the `index.html` file in a browser, you will get a CORS error that says something like this:

```
Access to XMLHttpRequest at 'file:///path-to-project/Endless-City/js/clusters/road.gltf'
from origin 'null' has been blocked by CORS policy: Cross origin requests are only
supported for protocol schemes: http, data, chrome, chrome-extension, https.
```

This is because browsers give different privileges and treatment to files if they’re local or on a web server.

To run this file without that error, you can test a local file out as if it were on a web server by following these steps:

```sh
cd Endless-City
python3 -m http.server 1234
```

Then navigate to http://localhost:1234 and voila!

## Features
 - Map camera controls with damping
 - Infinite map
 - Cars

## Preview
![alt text](https://raw.githubusercontent.com/Tomasz-Zielinski/Endless-City/master/preview.png)
