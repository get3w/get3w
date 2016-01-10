package storage

import (
	"github.com/fatih/structs"
	"github.com/get3w/get3w"
	"gopkg.in/yaml.v2"
)

// WriteConfig write content to config file
func (parser *Parser) WriteConfig() error {
	config := structs.Map(parser.Config)
	for _, site := range parser.Sites {
		if site.Path == "." {
			for key, val := range site.AllParameters {
				if _, ok := config[key]; !ok {
					config[key] = val
				}
			}
		}
	}
	bs, err := yaml.Marshal(config)
	if err != nil {
		return err
	}
	return parser.Storage.Write(parser.Storage.GetSourceKey(KeyConfig), bs)
}

func loadConfig(s Storage) *get3w.Config {
	config := &get3w.Config{}
	path := s.GetRootKey(KeyConfig)
	if s.IsExist(path) {
		data, _ := s.Read(path)
		yaml.Unmarshal(data, config)
	}

	if config.TemplateEngine == "" {
		config.TemplateEngine = TemplateEngineLiquid
	}
	if config.LayoutLink == "" {
		config.LayoutLink = "default"
	}
	if config.LayoutPost == "" {
		config.LayoutPost = "post"
	}
	if config.Destination == "" {
		config.Destination = "_public"
	}
	if config.UploadsDir == "" {
		config.UploadsDir = "assets/images"
	}

	return config
}

// LoadSiteParameters load parameters for current site
func (parser *Parser) LoadSiteParameters(loadDefault bool) {
	allParameters := make(map[string]interface{})
	path := parser.key(KeyConfig)
	if parser.Storage.IsExist(path) {
		data, _ := parser.Storage.Read(path)
		yaml.Unmarshal(data, allParameters)
	} else {
		if loadDefault {
			for key, val := range parser.Default.AllParameters {
				if _, ok := allParameters[key]; !ok {
					allParameters[key] = val
				}
			}
		}
	}

	parser.Current.AllParameters = allParameters
}
