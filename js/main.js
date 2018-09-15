const NORTH = 1;
const EAST = -0.5;
const SOUTH = 2;
const WEST = 0.5;

var camera, scene, controls, renderer, mouse = new THREE.Vector2(), raycaster = new THREE.Raycaster(), stats, loader, light, carList = [], manager = new THREE.LoadingManager(), loader = new THREE.ObjectLoader(manager);

var clusterNames = [
    'factory', 'house2', 'shoparea', 'house', 'apartments', 'shops', 'fastfood', 'house3', 'stadium', 'gas', 'supermarket', 'coffeeshop', 'residence', 'bus', 'park', 'supermarket'
]

const cluster = [
    { x: 1, z: 0, cluster: "road" },
    { x: 1, z: 0, cluster: "cars", cars: true },

    { x: 2, z: 2, cluster: clusterNames[0], direction: SOUTH },
    { x: 2, z: 1, cluster: clusterNames[1], direction: SOUTH },
    { x: 2, z: 0, cluster: clusterNames[2], direction: SOUTH },
    { x: 2, z: -1, cluster: clusterNames[3], direction: SOUTH },
    { x: 2, z: -2, cluster: clusterNames[0], direction: SOUTH },
    { x: 2, z: -3, cluster: clusterNames[1], direction: SOUTH },
    { x: 2, z: -4, cluster: clusterNames[2], direction: SOUTH },
    { x: 2, z: -5, cluster: clusterNames[3], direction: SOUTH },

    { x: 1, z: 2, cluster: clusterNames[4], direction: SOUTH },
    { x: 1, z: 1, cluster: clusterNames[7], direction: SOUTH },
    { x: 1, z: 0, cluster: clusterNames[8], direction: SOUTH },
    { x: 1, z: -1, cluster: clusterNames[9], direction: SOUTH },
    { x: 1, z: -2, cluster: clusterNames[4], direction: SOUTH },
    { x: 1, z: -3, cluster: clusterNames[7], direction: SOUTH },
    { x: 1, z: -4, cluster: clusterNames[8], direction: SOUTH },
    { x: 1, z: -5, cluster: clusterNames[9], direction: SOUTH },

    { x: 0, z: 2, cluster: clusterNames[5], direction: SOUTH },
    { x: 0, z: 1, cluster: clusterNames[10], direction: SOUTH },
    { x: 0, z: 0, cluster: clusterNames[12], direction: SOUTH },
    { x: 0, z: -1, cluster: clusterNames[13], direction: SOUTH },
    { x: 0, z: -2, cluster: clusterNames[5], direction: SOUTH },
    { x: 0, z: -3, cluster: clusterNames[10], direction: SOUTH },
    { x: 0, z: -4, cluster: clusterNames[12], direction: SOUTH },
    { x: 0, z: -5, cluster: clusterNames[13], direction: SOUTH },

    { x: -1, z: 2, cluster: clusterNames[6], direction: SOUTH },
    { x: -1, z: 1, cluster: clusterNames[11], direction: SOUTH },
    { x: -1, z: 0, cluster: clusterNames[14], direction: SOUTH },
    { x: -1, z: -1, cluster: clusterNames[15], direction: SOUTH },
    { x: -1, z: -2, cluster: clusterNames[6], direction: SOUTH },
    { x: -1, z: -3, cluster: clusterNames[11], direction: SOUTH },
    { x: -1, z: -4, cluster: clusterNames[14], direction: SOUTH },
    { x: -1, z: -5, cluster: clusterNames[15], direction: SOUTH },

    { x: -2, z: 2, cluster: clusterNames[0], direction: SOUTH },
    { x: -2, z: 1, cluster: clusterNames[1], direction: SOUTH },
    { x: -2, z: 0, cluster: clusterNames[2], direction: SOUTH },
    { x: -2, z: -1, cluster: clusterNames[3], direction: SOUTH },
    { x: -2, z: -2, cluster: clusterNames[0], direction: SOUTH },
    { x: -2, z: -3, cluster: clusterNames[1], direction: SOUTH },
    { x: -2, z: -4, cluster: clusterNames[2], direction: SOUTH },
    { x: -2, z: -5, cluster: clusterNames[3], direction: SOUTH },

    { x: -3, z: 2, cluster: clusterNames[4], direction: SOUTH },
    { x: -3, z: 1, cluster: clusterNames[7], direction: SOUTH },
    { x: -3, z: 0, cluster: clusterNames[8], direction: SOUTH },
    { x: -3, z: -1, cluster: clusterNames[9], direction: SOUTH },
    { x: -3, z: -2, cluster: clusterNames[4], direction: SOUTH },
    { x: -3, z: -3, cluster: clusterNames[7], direction: SOUTH },
    { x: -3, z: -4, cluster: clusterNames[8], direction: SOUTH },
    { x: -3, z: -5, cluster: clusterNames[9], direction: SOUTH },

    { x: -4, z: 2, cluster: clusterNames[5], direction: SOUTH },
    { x: -4, z: 1, cluster: clusterNames[10], direction: SOUTH },
    { x: -4, z: 0, cluster: clusterNames[12], direction: SOUTH },
    { x: -4, z: -1, cluster: clusterNames[13], direction: SOUTH },
    { x: -4, z: -2, cluster: clusterNames[5], direction: SOUTH },
    { x: -4, z: -3, cluster: clusterNames[10], direction: SOUTH },
    { x: -4, z: -4, cluster: clusterNames[12], direction: SOUTH },
    { x: -4, z: -5, cluster: clusterNames[13], direction: SOUTH },

    { x: -5, z: 2, cluster: clusterNames[6], direction: SOUTH },
    { x: -5, z: 1, cluster: clusterNames[11], direction: SOUTH },
    { x: -5, z: 0, cluster: clusterNames[14], direction: SOUTH },
    { x: -5, z: -1, cluster: clusterNames[15], direction: SOUTH },
    { x: -5, z: -2, cluster: clusterNames[6], direction: SOUTH },
    { x: -5, z: -3, cluster: clusterNames[11], direction: SOUTH },
    { x: -5, z: -4, cluster: clusterNames[14], direction: SOUTH },
    { x: -5, z: -5, cluster: clusterNames[15], direction: SOUTH },
];

initCity();
animate();

function initCity() {

    // Statistics settings
    stats = new Stats();
    stats.showPanel(0);
    document.body.appendChild(stats.dom);

    // Manager settings
    manager.onProgress = (url, i, all) => document.querySelector('p').textContent = `${Math.ceil(i / all * 100)}%`;
    manager.onLoad = () => { document.querySelector(".load").remove() };

    // Scene settings
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(new THREE.Color(0x000000), 200, 300);

    // Camera settings
    camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 50, 200);
    camera.position.set(10, 100, 10);
    controls = new THREE.MapControls(camera);

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
    scene.add(new THREE.HemisphereLight(0x9a9a9a, 0x1a1a1a, 0.5));

    // Renderer settings
    renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas'), antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);

    //Events
    window.addEventListener("resize", onResize, false);
    window.addEventListener("mousemove", onMouseMove, false);

    // Load map
    cluster.forEach((cls) => loadCluster(cls));
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseMove(event) {
    event.preventDefault();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
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
    } else if (camera.position.x < -120) {
        controls.target.x += LEAP;
        camera.position.x += LEAP;
    }
    if (camera.position.z > 130) {
        controls.target.z -= LEAP;
        camera.position.z -= LEAP;
    } else if (camera.position.z < -120) {
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
            if (car.distance > 600) {
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
    stats.end();
    renderer.render(scene, camera);
}

function loadCluster({ x, z, cluster, direction, cars }) {
    loader.load(`js/clusters/${cluster}.json`, obj => {
        obj.position.set(x * 60, 0, z * 60)
        if (direction) obj.rotation.y = Math.PI * direction;
        if (direction === EAST) obj.position.x += 20;
        else if (direction === WEST) obj.position.z += 20;
        else if (direction === NORTH) obj.position.set(obj.position.x + 20, 0, obj.position.z + 20);
        scene.add(obj);
        if (cars) {
            obj.children.forEach(e => {
                carList.push({ data: e, distance: 0, speed: 0, maxSpeed: ((Math.random() * 0.3) + 0.2).toFixed(1), r: new THREE.Raycaster(new THREE.Vector3(e.position.x, 2, e.position.z), new THREE.Vector3(e.userData.x, 0, e.userData.z), 5, 15) })
            });
        }
    });
};


