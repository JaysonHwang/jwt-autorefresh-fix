import { encode, decode } from 'jwt-simple'
import autorefresh from '../'

const SECRET = 'xxx'
const REQUIRED_CLAIMS = [ 'iat', 'nbf', 'exp' ]
const RECOMMENDED_CLAIMS = [ 'sub', 'aud' ]

const generate = () => {
  const DATE_NOW = Date.now();
  const iat = DATE_NOW / 1000;
  const nbf = iat + 1;
  const claimsPass = [
    { iat, nbf, exp: nbf + 1 },
    { iat, nbf, exp: nbf + 10 },
    { iat, nbf, exp: nbf + 100 },
  ];

  const claimsFail = [
    { iat, nbf, exp: nbf - 100 },
    { iat: DATE_NOW / 100, nbf: DATE_NOW / 100, exp: DATE_NOW / 100 - 1 }, 
    { iat: DATE_NOW / 10, nbf: DATE_NOW / 10, exp: DATE_NOW / 10 }, 
    { iat: DATE_NOW * -1, nbf: DATE_NOW * -1, exp: DATE_NOW * -1 + 1 },
  ]

  const jwtPass = claimsPass.map(x => encode(x, SECRET))
  const jwtFail = claimsFail.map(x => encode(x, SECRET))
  const refreshPass = jwtPass.map(x => () => Promise.resolve(x))
  const refreshFail = jwtFail.map(x => () => { throw new Error('BAD REFRESH')})
  const leadSecondsPass = [10, () => 100]
  const leadSecondsFail = [-10, () => -1]
  const delayFuncPass = [
    undefined,
    ({ iat, exp, lead }) => {
      return exp - iat - lead;
    },
  ];
  const delayFuncFail = ['not a function or undefined'];
  return { nbf, claimsPass, claimsFail, jwtPass, jwtFail, refreshPass, refreshFail, leadSecondsPass, leadSecondsFail, delayFuncPass, delayFuncFail }
}

describe('autorefresh', () => {
  let data = null
  beforeEach(() => { data = generate() })
  afterEach(() => { data = null })

  it('is a function', () => expect(autorefresh).toEqual(jasmine.any(Function)))
  it('with no params throws', () => expect(() => autorefresh()).toThrow())

  it('with no refresh throws', () => {
    const {leadSecondsPass} = data
    const [leadSeconds] = leadSecondsPass
    expect(() => autorefresh({ leadSeconds })).toThrow()
  })

  it('with no leadSeconds throws', () => {
    const {refreshPass} = data
    const [refresh] = refreshPass
    expect(() => autorefresh({ refresh })).toThrow()
  })
  it('with valid params returns function', () => {
    const {refreshPass, leadSecondsPass, delayFuncPass } = data
    const [refresh] = refreshPass
    const [leadSeconds] = leadSecondsPass
    const [delayFunc] = delayFuncPass
    expect(autorefresh({ refresh, leadSeconds, delayFunc })).toEqual(jasmine.any(Function))
  })

  it('start thunk with bad delayFunc throws', () => {
    const {refreshPass, leadSecondsPass, jwtPass, delayFuncFail } = data
    const [refresh] = refreshPass
    const [leadSeconds] = leadSecondsPass
    const [access_token] = jwtPass
    const [delayFunc] = delayFuncFail
    expect(() => autorefresh({ refresh, leadSeconds, delayFunc })(access_token)).toThrow()
  })

  it('start thunk with bad refresh throws', () => {
    const {refreshFail, leadSecondsPass, jwtPass} = data
    const [refresh] = refreshFail
    const [leadSeconds] = leadSecondsPass
    const [access_token] = jwtPass
    expect(() => autorefresh({ refresh, leadSeconds })(access_token)).toThrow()
  })

  it('start thunk with bad lead seconds throws', () => {
    const {refreshPass, leadSecondsFail, jwtPass} = data
    const [refresh] = refreshPass
    const [leadSeconds] = leadSecondsFail
    const [access_token] = jwtPass
    expect(() => autorefresh({ refresh, leadSeconds })(access_token)).toThrow()
  })

  it('start thunk throws for invalid token', () => {
    const {refreshPass, leadSecondsPass, jwtFail} = data
    const [refresh] = refreshPass
    const [leadSeconds] = leadSecondsPass
    const [access_token] = jwtFail
    expect(() => autorefresh({ refresh, leadSeconds })(access_token)).toThrow()
  })

  it('start thunk returns cancel function for valid token', () => {
    const {refreshPass, leadSecondsPass, jwtPass} = data
    const [refresh] = refreshPass
    const [leadSeconds] = leadSecondsPass
    const [access_token] = jwtPass
    expect(autorefresh({ refresh, leadSeconds })(access_token)).toEqual(jasmine.any(Function))
  })

  it('start thunk returns cancel function that returns falsy', () => {
    const {refreshPass, leadSecondsPass, jwtPass} = data
    const [refresh] = refreshPass
    const [leadSeconds] = leadSecondsPass
    const [access_token] = jwtPass
    expect(autorefresh({ refresh, leadSeconds })(access_token)()).toBeFalsy()
  })
})
