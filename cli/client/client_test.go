package client

import (
	"testing"

	"github.com/get3w/get3w/cliconfig"
	"github.com/stretchr/testify/assert"
)

var c *Get3WCli

func init() {
	c = &Get3WCli{}
	c.configFile = &cliconfig.ConfigFile{
		AuthConfig: cliconfig.AuthConfig{
			Username:    "local",
			Password:    "tttttt",
			Auth:        "bG9jYWw6dHR0dHR0",
			AccessToken: "f90cdc58-06fb-4ec3-bddc-27a9e59b37b4",
		},
	}
}

func TestGet(t *testing.T) {
	err := c.get("local/local", "_test")
	assert.Nil(t, err)
}

func TestBuild(t *testing.T) {
	err := c.build("_test")
	assert.Nil(t, err)
}

func TestPush(t *testing.T) {
	err := c.push("g3.com:99/local/local", "_test")
	assert.Nil(t, err)
}
