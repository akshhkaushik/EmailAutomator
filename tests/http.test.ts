import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicDestination, isPublicIpAddress, robotsAllows } from "../lib/discovery/http.ts";

test("rejects private, loopback, link-local, and documentation IPs", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.2", "172.16.0.1", "::1", "fd00::1", "fe80::1", "2001:db8::1"]) {
    assert.equal(isPublicIpAddress(address), false, address);
  }
  assert.equal(isPublicIpAddress("8.8.8.8"), true);
  assert.equal(isPublicIpAddress("2606:4700:4700::1111"), true);
});

test("rejects a hostname when any resolved address is private", async () => {
  await assert.rejects(
    assertPublicDestination(new URL("https://portfolio.example"), async () => [
      { address: "203.0.113.10", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]),
    /public internet addresses/,
  );
});

test("applies the longest matching robots rule", () => {
  const robots = "User-agent: *\nDisallow: /private\nAllow: /private/portfolio\n";
  assert.equal(robotsAllows(robots, "/public"), true);
  assert.equal(robotsAllows(robots, "/private/list"), false);
  assert.equal(robotsAllows(robots, "/private/portfolio"), true);
});
