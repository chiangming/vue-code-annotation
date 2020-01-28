/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * 建立响应式数据和watcher之间的桥梁
 * 一个静态属性 target，这是一个全局唯一 Watcher，因为在同一时间只能有一个全局的 Watcher 被计算，
 * 另外它的自身属性 subs 也是 Watcher 的数组。
 * 
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
export default class Dep {
  static target: ? Watcher;
  id: number; // 自身uid
  subs: Array < Watcher > ; //订阅数据变化的watcher数组

  constructor() {
    this.id = uid++
      this.subs = []
  }

  addSub(sub: Watcher) {
    this.subs.push(sub)
  }

  removeSub(sub: Watcher) {
    remove(this.subs, sub)
  }

  depend() {
      if (Dep.target) {
        Dep.target.addDep(this)
      }
    }
    /**
     * 遍历所有的 subs，也就是 Watcher 的实例数组，
     * 然后调用每一个 watcher 的 update 方法
     */
  notify() {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null // 当前的唯一watcher
const targetStack = []

export function pushTarget(target: ? Watcher) {
  targetStack.push(target)
  Dep.target = target
}

export function popTarget() {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}