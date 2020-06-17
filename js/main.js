const NORTH = 1,
    EAST = -0.5,
    SOUTH = 2,
    WEST = 0.5,
    LEAP = 240

var camera,
    scene,
    controls,
    renderer,
    stats,
    loader,
    light,
    mouse = new THREE.Vector2(),
    raycaster = new THREE.Raycaster(),
    carList = [],
    manager = new THREE.LoadingManager(),
    loader = new THREE.GLTFLoader(manager)

var clusterNames = [
    'factory',
    'house2',
    'shoparea',
    'house',
    'apartments',
    'shops',
    'fastfood',
    'house3',
    'stadium',
    'gas',
    'supermarket',
    'coffeeshop',
    'residence',
    'bus',
    'park',
    'supermarket',
]

const cluster = [
    { x: 1, z: 0, cluster: 'road' },

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
]

initCity()
animate()

function initCity() {
    // Statistics settings
    stats = new Stats()
    stats.showPanel(0)
    document.body.appendChild(stats.dom)

    // Manager settings
    manager.onProgress = (url, i, all) =>
        (document.querySelector('p').textContent = `${Math.ceil(
            (i / all) * 100
        )}%`)
    manager.onLoad = () => {
        document.querySelector('.load').remove()
    }

    // Scene settings
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)
    scene.fog = new THREE.Fog(new THREE.Color(0x000000), 200, 300)

    // Camera settings
    camera = new THREE.PerspectiveCamera(
        40,
        window.innerWidth / window.innerHeight,
        50,
        200
    )
    camera.position.set(10, 100, 10)
    controls = new THREE.MapControls(camera)

    // Lights
    light = new THREE.DirectionalLight(0x9a9a9a, 1)
    light.position.set(-300, 750, -300)
    light.castShadow = true
    light.shadow.mapSize.width = light.shadow.mapSize.height = 4096
    light.shadow.camera.near = 1
    light.shadow.camera.far = 1000
    light.shadow.camera.left = light.shadow.camera.bottom = -200
    light.shadow.camera.right = light.shadow.camera.top = 200
    scene.add(light)
    scene.add(new THREE.HemisphereLight(0xefefef, 0xffffff, 1))

    // Renderer settings
    renderer = new THREE.WebGLRenderer({
        canvas: document.querySelector('canvas'),
        antialias: true,
    })
    renderer.shadowMap.enabled = true
    renderer.gammaInput = renderer.gammaOutput = true
    renderer.gammaFactor = 2.0
    renderer.setSize(window.innerWidth, window.innerHeight)

    //Events
    window.addEventListener('resize', onResize, false)
    window.addEventListener('mousemove', onMouseMove, false)

    // Load map
    cluster.forEach((cls) => loadCluster(cls))

    if (screen.width > 768) {
        loadCars({ x: 1, z: 0, cluster: 'cars' })
    }
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
}

function onMouseMove(event) {
    event.preventDefault()
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
}

function animate() {
    requestAnimationFrame(animate)
    render()
}

function render() {
    stats.begin()
    controls.update()

    if (camera.position.x > 130) {
        controls.target.x -= LEAP
        camera.position.x -= LEAP
        carList.forEach((car) => (car.position.x -= LEAP))
    } else if (camera.position.x < -120) {
        controls.target.x += LEAP
        camera.position.x += LEAP
        carList.forEach((car) => (car.position.x += LEAP))
    }
    if (camera.position.z > 130) {
        controls.target.z -= LEAP
        camera.position.z -= LEAP
        carList.forEach((car) => (car.position.z -= LEAP))
    } else if (camera.position.z < -120) {
        controls.target.z += LEAP
        camera.position.z += LEAP
        carList.forEach((car) => (car.position.z += LEAP))
    }

    raycaster.setFromCamera(mouse, camera)

    carList.forEach((car) => {
        car.r.set(
            new THREE.Vector3(car.position.x + 58, 1, car.position.z),
            new THREE.Vector3(car.userData.x, 0, car.userData.z)
        )
        let _NT = car.r.intersectObjects(carList, true)
        if (_NT.length > 0) {
            car.speed = 0
            return
        } else {
            car.speed = car.speed < car.maxSpeed ? car.speed + 0.002 : car.speed

            if (car.position.x < -380) car.position.x += LEAP * 2
            else if (car.position.x > 100) car.position.x -= LEAP * 2
            if (car.position.z < -320) car.position.x += LEAP * 2
            else if (car.position.z > 160) car.position.x -= LEAP * 2

            car.position.x += car.userData.x * car.speed
            car.position.z += car.userData.z * car.speed
        }
    })
    stats.end()
    renderer.render(scene, camera)
}

function loadCluster({ x, z, cluster, direction }) {
    loader.load(`js/clusters/${cluster}.glb`, (gltf) => {
        gltf.scene.traverse(function (child) {
            if (child.isMesh) {
                child.receiveShadow = true
                child.castShadow = true
            }
        })

        gltf.scene.position.set(x * 60, 0, z * 60)
        if (direction) gltf.scene.rotation.y = Math.PI * direction
        else if (direction === EAST) gltf.scene.position.x += 20
        else if (direction === WEST) gltf.scene.position.z += 20
        else if (direction === NORTH)
            gltf.scene.position.set(
                gltf.scene.position.x + 20,
                0,
                ogltfbj.scene.position.z + 20
            )

        scene.add(gltf.scene)
    })
}

function loadCars({ x, z, cluster, direction }) {
    loader.load(`js/clusters/${cluster}.gltf`, (gltf) => {
        gltf.scene.traverse(function (child) {
            if (child.isMesh) {
                child.receiveShadow = true
                child.castShadow = true
            }
        })

        gltf.scene.position.set(x * 60, 0, z * 60)

        if (direction) gltf.scene.rotation.y = Math.PI * direction
        else if (direction === EAST) gltf.scene.position.x += 20
        else if (direction === WEST) gltf.scene.position.z += 20
        else if (direction === NORTH)
            gltf.scene.position.set(
                gltf.scene.position.x + 20,
                0,
                ogltfbj.scene.position.z + 20
            )

        scene.add(gltf.scene)

        gltf.scene.children.forEach((e) => {
            e.distance = 0
            e.maxSpeed = 0.3
            e.speed = e.maxSpeed
            e.r = new THREE.Raycaster(
                new THREE.Vector3(e.position.x, 2, e.position.z),
                new THREE.Vector3(e.userData.x, 0, e.userData.z),
                5,
                15
            )
            carList.push(e)
        })
    })
}
