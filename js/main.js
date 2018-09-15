const NORTH = 1;
const EAST = -0.5;
const SOUTH = 2;
const WEST = 0.5;

var camera, scene, controls, renderer, INTERSECTED, raycaster, container, stats, lastLoad, loader;
var carList = [];
var scene_home, camera_home;

var music, light;
var shell = document.querySelector(".shell");
var info = document.querySelector(".info");

var clock = new THREE.Clock();

var clusterNames = [
    'factory', 'house2', 'shoparea', 'house', 'apartments', 'shops', 'fastfood', 'house3', 'stadium', 'gas', 'supermarket', 'coffeeshop', 'residence', 'bus', 'park', 'supermarket'
]

var directions = [1, -0.5, 2, 0.5]

initCity();
initHome();
animate();

const closePopup = (e) => {
    e.style.display = e.style.display == "none" ? "block" : e.style.display;
    e.style.visibility = e.style.visibility == "visible" ? "hidden" : e.style.visibility;
    e.style.opacity = e.style.opacity == 1 ? 0 : e.style.opacity;
}

function initCity() {
    stats = new Stats();
    stats.showPanel(0);
    document.body.appendChild(stats.dom);

    var manager = new THREE.LoadingManager();
    manager.onProgress = (url, loaded, total) => {
        document.querySelector('.progress').textContent = `${Math.ceil(loaded / total * 100)}%`;
    };
    manager.onLoad = () => { document.querySelector(".load").remove() };

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas'), antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(new THREE.Color(0x000000), 200, 300);

    camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 50, 200);
    camera.position.set(10, 100, 10);

    controls = new THREE.MapControls(camera);
    loader = new THREE.ObjectLoader(manager);

    const displayInfo = ({ data }) => {
        let info = document.querySelectorAll(".info")[0];
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
        loader.load("js/clusters/" + cluster + ".json", obj => {
            obj.position.set(x * 60, 0, z * 60)
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

    clusters = generateCluster(0, 0);

    clusters.forEach((cluster) => { clusterLoader(cluster) });

    // Lights
    light = new THREE.DirectionalLight(0xFFFFFF);
    light.position.set(50, 75, 50);
    light.castShadow = true;
    light.shadow.mapSize.width = light.shadow.mapSize.height = 4096;
    light.shadow.camera.near = 0;
    light.shadow.camera.far = 1500;
    light.shadow.camera.left = light.shadow.camera.bottom = -200;
    light.shadow.camera.right = light.shadow.camera.top = 200;
    scene.add(light);
    scene.add(new THREE.HemisphereLight(0x555555, 0xfffffff, 0.3));


    window.addEventListener("resize", resize, false);

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
            if (document.querySelector('.content').style.visibility != "visible") {
                document.querySelector('.content').style.visibility = "visible";
            }
            else document.querySelector('.content').style.visibility = "hidden"
        } else if (e.keyCode == 220) {

        } else if (e.keyCode == 9) {
            e.preventDefault();
            let temp_scene = scene;
            let temp_camera = camera;
            let temp_controls = controls;
            if (scene != scene_home) {
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
            if (INTERSECTED.userData.state) {
                new Audio("sounds/door.mp3").play();
                if (INTERSECTED.userData.state === "closed") {
                    INTERSECTED.rotation.y += Math.PI / 2;
                    INTERSECTED.userData.state = "open";
                } else {
                    INTERSECTED.rotation.y -= Math.PI / 2;
                    INTERSECTED.userData.state = "closed";
                }
            } else if (INTERSECTED.userData.terminal) {
                document.querySelector(".shell").style.visibility = "visible";
                document.querySelector(".shell").style.opacity = "1";
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

function initHome() {
    scene_home = new THREE.Scene();
    scene_home.background = new THREE.Color(0x000000);

    loader.load("js/clusters/home.json", obj => scene_home.add(obj))

    camera_home = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 5, 100);
    controls_home = new THREE.MapControls(camera_home);
    controls_home.enablePan = true;
    controls_home.enableZoom = false;
    controls_home.enableRotate = true;
    controls_home.minDistance = 0;
    controls_home.maxDistance = 20;
    camera_home.position.set(2, 20, 2);
}

function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    render();
    requestAnimationFrame(animate);
}

function render() {
    stats.begin();
    controls.update();
    const LEAP = 240;
    if (camera.position.x > 130) {
        controls.target.x -= LEAP;
        camera.position.x -= LEAP;
    }
    if (camera.position.x < -120) {
        controls.target.x += LEAP;
        camera.position.x += LEAP;
    }
    if (camera.position.z > 130) {
        controls.target.z -= LEAP;
        camera.position.z -= LEAP;
    }
    if (camera.position.z < -120) {
        controls.target.z += LEAP;
        camera.position.z += LEAP;
    }

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

    // let intersects = raycaster.intersectObjects(scene.children, true);
    // if (intersects.length > 0) {
    //     if (INTERSECTED != intersects[0].object) {
    //         if (INTERSECTED) {
    //             INTERSECTED.material.transparent = false;
    //             INTERSECTED.material.opacity = 1;
    //             $('html,body').css('cursor', 'default');
    //         }
    //         INTERSECTED = intersects[0].object;
    //         if (Object.keys(INTERSECTED.userData).length > 0) {
    //             $('html,body').css('cursor', 'pointer');
    //             INTERSECTED.material.transparent = true;
    //             INTERSECTED.material.opacity = 0.7;
    //         }
    //     }
    // } else {
    //     $('html,body').css('cursor', 'default');
    //     if (INTERSECTED) {
    //         INTERSECTED.material.transparent = false;
    //         INTERSECTED.material.opacity = 1;
    //     }
    //     INTERSECTED = null;
    // }
    stats.end();
    renderer.render(scene, camera);
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
    $('.terminal').terminal(function (command, term) {
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



document.querySelector(".shell-exit").addEventListener("click", (e) => { closePopup(shell); })

dragElement(document.querySelector(".shell"));

function dragElement(elmnt) {
    var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    if (document.querySelector("." + elmnt.id + "header")) {
        document.querySelector("." + elmnt.id + "header").onmousedown = dragMouseDown;
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

function generateCluster() {
    return [
        { x: 1, z: 0, cluster: "road" },
        // { x: 1, z: 0, cluster: "cars", cars: false },

        { x: 2, z: 2, cluster: clusterNames[0], direction: directions[SOUTH] },
        { x: 2, z: 1, cluster: clusterNames[1], direction: directions[SOUTH] },
        { x: 2, z: 0, cluster: clusterNames[2], direction: directions[SOUTH] },
        { x: 2, z: -1, cluster: clusterNames[3], direction: directions[SOUTH] },
        { x: 2, z: -2, cluster: clusterNames[0], direction: directions[SOUTH] },
        { x: 2, z: -3, cluster: clusterNames[1], direction: directions[SOUTH] },
        { x: 2, z: -4, cluster: clusterNames[2], direction: directions[SOUTH] },
        { x: 2, z: -5, cluster: clusterNames[3], direction: directions[SOUTH] },

        { x: 1, z: 2, cluster: clusterNames[4], direction: directions[SOUTH] },
        { x: 1, z: 1, cluster: clusterNames[7], direction: directions[SOUTH] },
        { x: 1, z: 0, cluster: clusterNames[8], direction: directions[SOUTH] },
        { x: 1, z: -1, cluster: clusterNames[9], direction: directions[SOUTH] },
        { x: 1, z: -2, cluster: clusterNames[4], direction: directions[SOUTH] },
        { x: 1, z: -3, cluster: clusterNames[7], direction: directions[SOUTH] },
        { x: 1, z: -4, cluster: clusterNames[8], direction: directions[SOUTH] },
        { x: 1, z: -5, cluster: clusterNames[9], direction: directions[SOUTH] },

        { x: 0, z: 2, cluster: clusterNames[5], direction: directions[SOUTH] },
        { x: 0, z: 1, cluster: clusterNames[10], direction: directions[SOUTH] },
        { x: 0, z: 0, cluster: clusterNames[12], direction: directions[SOUTH] },
        { x: 0, z: -1, cluster: clusterNames[13], direction: directions[SOUTH] },
        { x: 0, z: -2, cluster: clusterNames[5], direction: directions[SOUTH] },
        { x: 0, z: -3, cluster: clusterNames[10], direction: directions[SOUTH] },
        { x: 0, z: -4, cluster: clusterNames[12], direction: directions[SOUTH] },
        { x: 0, z: -5, cluster: clusterNames[13], direction: directions[SOUTH] },

        { x: -1, z: 2, cluster: clusterNames[6], direction: directions[SOUTH] },
        { x: -1, z: 1, cluster: clusterNames[11], direction: directions[SOUTH] },
        { x: -1, z: 0, cluster: clusterNames[14], direction: directions[SOUTH] },
        { x: -1, z: -1, cluster: clusterNames[15], direction: directions[SOUTH] },
        { x: -1, z: -2, cluster: clusterNames[6], direction: directions[SOUTH] },
        { x: -1, z: -3, cluster: clusterNames[11], direction: directions[SOUTH] },
        { x: -1, z: -4, cluster: clusterNames[14], direction: directions[SOUTH] },
        { x: -1, z: -5, cluster: clusterNames[15], direction: directions[SOUTH] },

        { x: -2, z: 2, cluster: clusterNames[0], direction: directions[SOUTH] },
        { x: -2, z: 1, cluster: clusterNames[1], direction: directions[SOUTH] },
        { x: -2, z: 0, cluster: clusterNames[2], direction: directions[SOUTH] },
        { x: -2, z: -1, cluster: clusterNames[3], direction: directions[SOUTH] },
        { x: -2, z: -2, cluster: clusterNames[0], direction: directions[SOUTH] },
        { x: -2, z: -3, cluster: clusterNames[1], direction: directions[SOUTH] },
        { x: -2, z: -4, cluster: clusterNames[2], direction: directions[SOUTH] },
        { x: -2, z: -5, cluster: clusterNames[3], direction: directions[SOUTH] },

        { x: -3, z: 2, cluster: clusterNames[4], direction: directions[SOUTH] },
        { x: -3, z: 1, cluster: clusterNames[7], direction: directions[SOUTH] },
        { x: -3, z: 0, cluster: clusterNames[8], direction: directions[SOUTH] },
        { x: -3, z: -1, cluster: clusterNames[9], direction: directions[SOUTH] },
        { x: -3, z: -2, cluster: clusterNames[4], direction: directions[SOUTH] },
        { x: -3, z: -3, cluster: clusterNames[7], direction: directions[SOUTH] },
        { x: -3, z: -4, cluster: clusterNames[8], direction: directions[SOUTH] },
        { x: -3, z: -5, cluster: clusterNames[9], direction: directions[SOUTH] },

        { x: -4, z: 2, cluster: clusterNames[5], direction: directions[SOUTH] },
        { x: -4, z: 1, cluster: clusterNames[10], direction: directions[SOUTH] },
        { x: -4, z: 0, cluster: clusterNames[12], direction: directions[SOUTH] },
        { x: -4, z: -1, cluster: clusterNames[13], direction: directions[SOUTH] },
        { x: -4, z: -2, cluster: clusterNames[5], direction: directions[SOUTH] },
        { x: -4, z: -3, cluster: clusterNames[10], direction: directions[SOUTH] },
        { x: -4, z: -4, cluster: clusterNames[12], direction: directions[SOUTH] },
        { x: -4, z: -5, cluster: clusterNames[13], direction: directions[SOUTH] },

        { x: -5, z: 2, cluster: clusterNames[6], direction: directions[SOUTH] },
        { x: -5, z: 1, cluster: clusterNames[11], direction: directions[SOUTH] },
        { x: -5, z: 0, cluster: clusterNames[14], direction: directions[SOUTH] },
        { x: -5, z: -1, cluster: clusterNames[15], direction: directions[SOUTH] },
        { x: -5, z: -2, cluster: clusterNames[6], direction: directions[SOUTH] },
        { x: -5, z: -3, cluster: clusterNames[11], direction: directions[SOUTH] },
        { x: -5, z: -4, cluster: clusterNames[14], direction: directions[SOUTH] },
        { x: -5, z: -5, cluster: clusterNames[15], direction: directions[SOUTH] },
    ];
}