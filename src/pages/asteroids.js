import { boot } from '../boot.js'
import { mount } from '../specimens/asteroids.js'
import { mount as mountOriginal } from '../specimens/asteroids.original.js'

boot('asteroids', { edit: mount, original: mountOriginal })
