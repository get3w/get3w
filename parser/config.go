package parser

import (
	"github.com/get3w/get3w-sdk-go/get3w"

	"gopkg.in/yaml.v2"
)

// LoadConfig load CONFIG.yaml string to model
func LoadConfig(config *get3w.Config, data string) error {
	if data == "" {
		return nil
	}
	return yaml.Unmarshal([]byte(data), config)
}
