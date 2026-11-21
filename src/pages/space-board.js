import { boot } from '../boot.js'
import { mount } from '../specimens/space-board.js'
import { mount as mountOriginal } from '../specimens/space-board.original.js'

boot('space-board', { edit: mount, original: mountOriginal })
