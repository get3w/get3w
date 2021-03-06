package apps

import (
	"net/http"

	"github.com/get3w/get3w/server/api"
	"github.com/get3w/get3w/storage"
	"github.com/labstack/echo"
)

// Publish app
func Publish() echo.HandlerFunc {
	return func(c echo.Context) error {
		appPath := c.Param("app_path")
		if appPath == "" {
			return api.ErrorNotFound(c, nil)
		}

		if api.IsAnonymous(c) {
			return api.ErrorUnauthorized(c, nil)
		}

		parser, err := storage.NewLocalParser(api.Owner(c), appPath)
		if err != nil {
			return api.ErrorInternal(c, err)
		}

		parser.Build(true)

		return c.String(http.StatusOK, "")
	}
}
