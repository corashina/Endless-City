const NORTH = 1;
const EAST = -0.5;
const SOUTH = 2;
const WEST = 0.5;

var camera, scene, controls, renderer, INTERSECTED, raycaster, container, stats, lastLoad, loader, listener, audioLoader;
var carList = [];
var scene_home, camera_home;

var music;
var shell = document.getElementById("shell");
var info = document.getElementsByClassName("info")[0];

var clock = new THREE.Clock();
var helper;

var canvasInv;
var scenesInv = [];
var loaderInv;

var inventory = {}

var current = true;

init();
home();
initInventory();
animate();

const closePopup = (e) => {
    e.style.display = e.style.display == "none" ? "block" : e.style.display;
    e.style.visibility = e.style.visibility == "visible" ? "hidden" : e.style.visibility;
    e.style.opacity = e.style.opacity == 1 ? 0 : e.style.opacity;
}

function init() {
    stats = new Stats();
    stats.showPanel(0);
    document.body.appendChild(stats.dom);

    var progressBar = document.getElementById("progressBar");
    var progressCounter = document.getElementById("progressCounter");

    var manager = new THREE.LoadingManager();
    manager.onProgress = (url, loaded, total) => {
        if (loaded / total > lastLoad) {
            let percent = Math.round((loaded / total * 100 + 1)) + '%'
            progressBar.style.width = percent;
            progressCounter.textContent = percent;
        }
        lastLoad = loaded / total;
    };
    manager.onLoad = () => { document.getElementById("loadingScreen").style.display = "none" };

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('ctx'),
        antialias: true,
    });
    renderer.shadowMap.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(new THREE.Color(0x000000), 200, 300);

    camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 50, 300);
    camera.position.set(10, 100, 10);

    controls = new THREE.MapControls(camera);
    loader = new THREE.ObjectLoader(manager);


    const displayInfo = ({ data }) => {
        let info = document.getElementsByClassName("info")[0];
        if (data != null) info.innerHTML =
            `
        <p>${data.name}</p>
        <p>IP: ${data.ip}</p>
        <p>Security: enabled</p>
        `;
        else info.textContent = "Sranie";
        if (info.style.visibility == "visible") info.style.visibility = "hidden";
        else info.style.visibility = "visible";
    };

    const clusterLoader = ({ x, z, cluster, direction, cars }) => {
        loader.load("../clusters/" + cluster + ".json", obj => {
            obj.position.set(obj.position.x + x * 60, 0, obj.position.z + z * 60)
            if (direction != null) obj.rotation.y = Math.PI * direction;
            switch (direction) {
                case EAST:
                    obj.position.x += 20;
                    break;
                case WEST:
                    obj.position.z += 20;
                    break;
                case NORTH:
                    obj.position.set(obj.position.x + 20, 0, obj.position.z + 20)
                    break;
            }
            scene.add(obj);
            if (cars == true) {
                obj.children.forEach(e => {
                    carList.push({ data: e, distance: 0, speed: 0, maxSpeed: ((Math.random() * 0.3) + 0.2).toFixed(1), r: new THREE.Raycaster(new THREE.Vector3(e.position.x, 2, e.position.z), new THREE.Vector3(e.userData.x, 0, e.userData.z), 5, 15) })
                });
            }
        });
    };

    let clusters = [
        { x: 1, z: 0, cluster: "road" },
        { x: 1, z: 0, cluster: "cars", cars: true },

        { x: -2, z: -2, cluster: "factory", direction: SOUTH },
        { x: -1, z: -2, cluster: "house2", direction: SOUTH },
        { x: 0, z: -2, cluster: "shoparea", direction: EAST },
        { x: 1, z: -2, cluster: "house", direction: EAST },

        { x: -2, z: -1, cluster: "apartments", direction: SOUTH },
        { x: -1, z: -1, cluster: "shops", direction: SOUTH },
        { x: 0, z: -1, cluster: "fastfood", direction: EAST },
        { x: 1, z: -1, cluster: "house3", direction: SOUTH },

        { x: -2, z: 0, cluster: "stadium", direction: WEST },
        { x: -1, z: 0, cluster: "gas", direction: EAST },
        { x: 0, z: 0, cluster: "supermarket", direction: SOUTH },
        { x: 1, z: 0, cluster: "coffeeshop", direction: EAST },

        { x: -2, z: 1, cluster: "residence", direction: WEST },
        { x: -1, z: 1, cluster: "bus", direction: WEST },
        { x: 0, z: 1, cluster: "park", direction: EAST },
        { x: 1, z: 1, cluster: "house", direction: WEST }
    ];

    clusters.forEach((cluster) => { clusterLoader(cluster) });

    // Lights

    scene.add(new THREE.AmbientLight(0x090909));

    var light = new THREE.PointLight(0xADD8E6, 1, 200);
    light.position.set(-20, 50, -20);
    light.castShadow = true;
    light.shadow.mapSize.width = 512;
    light.shadow.mapSize.height = 512;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 150;
    scene.add(light);

    listener = new THREE.AudioListener();
    camera.add(listener);

    // create the PositionalAudio object (passing in the listener)
    var sound = new THREE.PositionalAudio(listener);


    // load a sound and set it as the PositionalAudio object's buffer
    audioLoader = new THREE.AudioLoader();
    audioLoader.load('sounds/ambient.mp3', function (buffer) {
        sound.setBuffer(buffer);
        sound.setRefDistance(20);
        sound.play();
    });
    scene.add(sound);


    window.addEventListener("resize", e => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }, false);

    document.addEventListener("mousemove", e => {
        event.preventDefault();
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }, false);

    document.addEventListener("keydown", e => {
        if (e.keyCode == 27) {
            e.preventDefault();
            closePopup(info)
            closePopup(shell)
            controls.enabled = true;
        } else if (e.keyCode == 69) {
            current = !current;
            if (document.getElementById('content').style.visibility != "visible") {
                document.getElementById('content').style.visibility = "visible";
            }
            else document.getElementById('content').style.visibility = "hidden"
        } else if (e.keyCode == 220) {

        } else if (e.keyCode == 9) {
            e.preventDefault();
            let temp_scene = scene;
            let temp_camera = camera;
            let temp_controls = controls;
            if (scene != scene_home) {
                if (sound.isPlaying) {
                    sound.pause();
                    music.play();
                } else {
                    sound.play();
                    music.pause();
                }
                scene = scene_home;
                camera = camera_home;
                controls = controls_home;
            }
            scene_home = temp_scene;
            camera_home = temp_camera;
            controls_home = temp_controls;
        }
    }, false);

    document.addEventListener("click", e => {
        if (INTERSECTED && Object.keys(INTERSECTED.userData).length > 0) {
            if (INTERSECTED.userData.loot) {
                addItem(INTERSECTED.userData.loot[Math.floor(Math.random() * INTERSECTED.userData.loot.length)])
            } else if (INTERSECTED.userData.state) {
                new Audio("sounds/door.mp3").play();
                if (INTERSECTED.userData.state === "closed") {
                    INTERSECTED.rotation.y += Math.PI / 2;
                    INTERSECTED.userData.state = "open";
                } else {
                    INTERSECTED.rotation.y -= Math.PI / 2;
                    INTERSECTED.userData.state = "closed";
                }
            } else if (INTERSECTED.userData.terminal) {
                document.getElementById("shell").style.visibility = "visible";
                document.getElementById("shell").style.opacity = "1";
                controls.enabled = false;
            } else if (INTERSECTED.userData.name) {
                new Audio("sounds/click.mp3").play();
                displayInfo({
                    data: INTERSECTED.userData
                });
            } else {

            }
        }
    }, false);
}

function initInventory() {
    for (var i = 0; i < 20; i++) {
        let template = document.getElementById("template").text;
        let content = document.getElementById("content");
        let scene = new THREE.Scene();
        scene.background = new THREE.Color(0x333333);
        let element = document.createElement("div");
        element.className = "list-item"
        element.innerHTML = template.replace('$', i);
        scene.userData.element = element.querySelector(".scene");
        content.appendChild(element);
        var camera = new THREE.PerspectiveCamera(50, 1, 1, 1000);
        scene.userData.camera = camera;
        let controls = new THREE.OrbitControls(scene.userData.camera, scene.userData.element);
        controls.enablePan = false;
        controls.enableDamping = true;
        controls.dampingFactor = 0.25;
        scene.userData.controls = controls;
        scenesInv.push(scene);
    }
}

function addItem(item) {
    if (!inventory[item]) {
        let scene = scenesInv[Object.keys(inventory).length];
        inventory[item] = 1;
        document.getElementsByClassName('list-item')[Object.keys(inventory).length - 1].children[1].textContent = `${item} - ${inventory[item]}`;
        document.getElementsByClassName('list-item')[Object.keys(inventory).length - 1].className += " item-" + item
        let camera = scene.userData.camera
        let controls = scene.userData.controls
        scene.background = new THREE.Color(0x333333);

        var loader = new THREE.GLTFLoader();
        loader.load(`items/${item}.gltf`, (gltf) => {
            let bbox = new THREE.Box3().setFromObject(gltf.scene);
            camera.position.z = (bbox.max.z - bbox.min.z) * 2;
            camera.position.y = (bbox.max.y - bbox.min.y) * 2;
            controls.target = bbox.getCenter();
            controls.update();

            var light = new THREE.DirectionalLight(0xffffff, 0.75);
            light.position.set((bbox.max.x - bbox.min.x), (bbox.max.y - bbox.min.y) * 2, (bbox.max.z - bbox.min.z));
            light.castShadow = true;
            scene.add(light)

            scene.add(new THREE.AmbientLight(0xffffff))
            scene.add(gltf.scene);

            gltf.scene.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
        },
            (xhr) => { console.log((xhr.loaded / xhr.total * 100) + '% loaded'); },
            (error) => { console.log(error); }
        );
    } else {
        document.getElementsByClassName('item-' + item)[0].children[1].textContent = `${item} - ${inventory[item] + 1}`;
        inventory[item] += 1;
    }
}

function home() {
    scene_home = new THREE.Scene();
    scene_home.background = new THREE.Color(0x000000);

    loader.load("./clusters/home.json", obj => {
        scene_home.add(obj);
    })

    music = new THREE.PositionalAudio(listener)
    audioLoader.load('sounds/inmymind.mp3', function (buffer) {
        music.setBuffer(buffer);
        music.setRefDistance(20);
    });
    scene_home.add(music);

    var modelFile = './js/weeb/miku_v2.pmd';
    var vmdFiles = ['js/weeb/wavefile_v2.vmd'];

    helper = new THREE.MMDAnimationHelper({
        afterglow: 2.0,
    });

    var loaderWeeb = new THREE.MMDLoader();
    loaderWeeb.loadWithAnimation(modelFile, vmdFiles, function (mmd) {
        mesh = mmd.mesh;
        mesh.castShadow = true;
        mesh.rotation.y = Math.PI / 2;
        mesh.position.x += 5;
        mesh.position.z -= 7;
        mesh.scale.set(0.15, 0.15, 0.15)
        scene_home.add(mesh);
        helper.add(mesh, {
            animation: mmd.animation,
            physics: true
        });
        ikHelper = helper.objects.get(mesh).ikSolver.createHelper();
        ikHelper.visible = false;
        scene_home.add(ikHelper);
        physicsHelper = helper.objects.get(mesh).physics.createHelper();
        physicsHelper.visible = false;
        scene_home.add(physicsHelper);
    });


    camera_home = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 5, 100);
    controls_home = new THREE.MapControls(camera_home);
    controls_home.enablePan = true;
    controls_home.enableZoom = true;
    controls_home.enableRotate = true;
    controls_home.minDistance = 0;
    controls_home.maxDistance = 20;
    camera_home.position.set(2, 20, 2);
}

function resS() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateSize() {
    let canvasInv = document.getElementById("c");
    var width = canvasInv.clientWidth;
    var height = canvasInv.clientHeight;
    if (canvasInv.width !== width || canvasInv.height !== height) {
        renderer.setSize(width, height, false);
    }
}

function animate() {
    if (current) {
        renderer.setScissorTest(false);
        resS();
        render1();
    }
    else {
        updateSize();
        render2();
    }
    requestAnimationFrame(animate);
}

function render1() {
    stats.begin();
    controls.update();
    raycaster.setFromCamera(mouse, camera);

    carList.forEach(car => {
        car.r.set(new THREE.Vector3(car.data.position.x + 58, 1, car.data.position.z), new THREE.Vector3(car.data.userData.x, 0, car.data.userData.z))
        let _NT = car.r.intersectObjects(scene.children, true);
        if (_NT.length > 0) {
            car.speed = 0;
            return;
        } else {
            if (car.speed < car.maxSpeed) car.speed += 0.002;
            if (car.distance > 210) {
                car.data.position.x -= car.data.userData.x * car.distance;
                car.data.position.z -= car.data.userData.z * car.distance;
                car.distance = 0;
            }
            let distanceX = car.data.userData.x * car.speed;
            let distanceZ = car.data.userData.z * car.speed
            car.data.position.x += distanceX;
            car.data.position.z += distanceZ;
            car.distance += Math.abs(distanceX) + Math.abs(distanceZ);
        }
    })

    let intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0) {
        if (INTERSECTED != intersects[0].object) {
            if (INTERSECTED) {
                INTERSECTED.material.transparent = false;
                INTERSECTED.material.opacity = 1;
                $('html,body').css('cursor', 'default');
            }
            INTERSECTED = intersects[0].object;
            if (Object.keys(INTERSECTED.userData).length > 0) {
                $('html,body').css('cursor', 'pointer');
                INTERSECTED.material.transparent = true;
                INTERSECTED.material.opacity = 0.7;
            }
        }
    } else {
        $('html,body').css('cursor', 'default');
        if (INTERSECTED) {
            INTERSECTED.material.transparent = false;
            INTERSECTED.material.opacity = 1;
        }
        INTERSECTED = null;
    }
    stats.end();
    helper.update(clock.getDelta());
    renderer.render(scene, camera);
}


function render2() {
    updateSize();
    renderer.setClearColor(0xffffff);
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    renderer.setClearColor(0xffffff);
    scenesInv.forEach(function (scene) {
        // for (let i = 0; i < scene.children.length; i++) {
        //     if (scene.children[i] instanceof THREE.Scene) scene.children[i].rotation.y = Date.now() * 0.001;
        // }
        var element = scene.userData.element;
        var rect = element.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > renderer.domElement.clientHeight ||
            rect.right < 0 || rect.left > renderer.domElement.clientWidth) {
            return;
        }
        var width = rect.right - rect.left;
        var height = rect.bottom - rect.top;
        var left = rect.left;
        var top = rect.top;
        renderer.setViewport(left, top, width, height);
        renderer.setScissor(left, top, width, height);
        var camera = scene.userData.camera;
        renderer.render(scene, camera);
    });
}

const ValidateIPaddress = (ipaddress) => {
    if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ipaddress)) {
        return (true)
    }
    return (false)
}

jQuery(function ($) {
    function progress(percent, width) {
        var size = Math.round(width * percent / 100);
        var left = '',
            taken = '',
            i;
        for (i = size; i--;) {
            taken += '=';
        }
        if (taken.length > 0) {
            taken = taken.replace(/=$/, '>');
        }
        for (i = width - size; i--;) {
            left += ' ';
        }
        return '[' + taken + left + '] ' + percent + '%';
    }
    var animation = false;
    var timer;
    var prompt;
    var string;
    $('#terminal').terminal(function (command, term) {
        var cmd = $.terminal.parse_command(command);
        if (cmd.name === "help") {
            prompt = term.get_prompt();
            term.echo("Available commands:\n help - view command list\n clear - clear screen\n scan args[] - scan open ports, args[] is an ip address").set_prompt(prompt);
        } else if (cmd.name == 'overflow') {
            let data = [];
            scene_home.children.forEach(sc => sc.children.forEach(ob => ob.children.forEach(el => el.userData.ip == cmd.args[0] ? data.push(el.userData) : 0)));
            if (data[0].ports.includes(cmd.args[1])) {
                data[0].security = false;
                term.echo("[[b;green;]overflowed " + data[0].ip).set_prompt(prompt);
            } else {
                term.echo("[[b;red;]port closed").set_prompt(prompt);
            }
        } else if (cmd.name == 'scan' && !ValidateIPaddress(cmd.args[0])) {
            prompt = term.get_prompt();
            term.echo("[[b;red;]invalid ip address").set_prompt(prompt);

        } else if (cmd.name == 'scan') {
            let i = 0,
                size = 50,
                ports = [];
            scene_home.children.forEach(sc => sc.children.forEach(ob => ob.children.forEach(el => el.userData.ip == cmd.args[0] ? ports.push(el.userData.ports) : 0)));
            prompt = term.get_prompt();
            string = progress(0, size);
            term.set_prompt(progress);
            animation = true;
            (function loop() {
                string = progress(i++, size);
                term.set_prompt(string);
                if (i < 100) {
                    timer = setTimeout(loop, 100);
                } else {
                    term.echo(progress(i, size) + ' [[b;green;]' + cmd.args[0] + ' Status: OK]\nOpen ports : ' + ports.join(", ")).set_prompt(prompt);
                    animation = false
                }
            })();
        } else {
            prompt = term.get_prompt();
            term.echo("[[b;red;]'" + cmd.name + "' is not recognized as an internal or external command, operable program or batch file.\n").set_prompt(prompt);
        }
    }, {
            greetings: 'Microsoft Windows [Version 10.0.17.134.112] \n(c) 2018 Microsoft Corporation. All rights reserved.\nType help to view available commands.\n',
            name: 'js_demo',
            height: 400,
            prompt: 'C:\\Windows>',
            onBlur: () => {
                closePopup(shell);
                controls.enabled = true;
            },
            keydown: function (e, term) {
                if (animation) {
                    if (e.which == 68 && e.ctrlKey) { // CTRL+D
                        clearTimeout(timer);
                        animation = false;
                        term.echo(string + ' [[b;red;]FAIL]')
                            .set_prompt(prompt);
                    }
                    return false;
                }
            }
        });
});



document.getElementById("shell-exit").addEventListener("click", (e) => { closePopup(shell); })

dragElement(document.getElementById("shell"));

function dragElement(elmnt) {
    var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    if (document.getElementById(elmnt.id + "header")) {
        document.getElementById(elmnt.id + "header").onmousedown = dragMouseDown;
    } else {
        elmnt.onmousedown = dragMouseDown;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}