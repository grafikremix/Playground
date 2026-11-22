import { boot } from '../boot.js'
import { mount } from '../specimens/tree.js'
import { mount as mountOriginal } from '../specimens/tree.original.js'

boot('tree', { edit: mount, original: mountOriginal })
