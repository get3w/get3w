package apps

import (
	"net/http"
	"time"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/config"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/storage"
	"github.com/get3w/get3w/www-server/api"

	"github.com/labstack/echo"
)

// Open app, local api only
func Open(c *echo.Context) error {
	appPath := c.Param("app_path")
	if appPath == "" {
		return api.ErrorNotFound(c, nil)
	}

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}
	owner := api.Owner(c)

	parser, err := storage.NewLocalParser(appPath)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	app := &get3w.App{
		Owner:       owner,
		Name:        parser.Name,
		Description: parser.Config.Description,
		Tags:        "",
		Path:        appPath,
		Private:     false,
		CreatedAt:   timeutils.ToString(time.Now()),
		UpdatedAt:   timeutils.ToString(time.Now()),
	}

	configFile, err := config.Load(config.ConfigDir())
	exists := false
	for _, app := range configFile.Apps {
		if app.Path == appPath {
			exists = true
			break
		}
	}
	if !exists {
		configFile.Apps = append(configFile.Apps, app)
		configFile.Save()
	}

	return c.JSON(http.StatusOK, configFile.Apps)
}
