package destination

import (
	"mime"
	"net/http"
	"path"
	"strings"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/config"
	"github.com/get3w/get3w/storage"
	"github.com/get3w/get3w/www-server/api"
	"github.com/labstack/echo"
)

// Get public resource
func Get(c *echo.Context) error {
	appName := c.Param("app_name")
	if appName == "" {
		return api.ErrorNotFound(c, nil)
	}
	p := c.P(1)
	if !strings.Contains(p, ".") {
		p = strings.TrimRight(p, "/") + "/index.html"
	}

	configFile, err := config.Load(config.ConfigDir())
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	var app *get3w.App
	for _, configApp := range configFile.Apps {
		if configApp.Name == appName {
			app = configApp
		}
	}

	if app == nil || app.Path == "" {
		return api.ErrorNotFound(c, nil)
	}

	parser, err := storage.NewLocalParser(app.Path)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	data, err := parser.Storage.Read(parser.Storage.GetDestinationKey(p))
	if err != nil {
		return api.ErrorNotFound(c, nil)
	}

	c.Response().Header().Set(echo.ContentType, mime.TypeByExtension(path.Ext(p)))
	c.Response().WriteHeader(http.StatusOK)
	c.Response().Write(data)

	return nil
}
